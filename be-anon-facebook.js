// ==UserScript==
// @name         Be Anon FB
// @version      1.0.0
// @description  Anonymous Facebook story viewing by suppressing story-seen GraphQL mutations (XHR + Fetch)
// @license      MIT
// @author       Evrenos
// @namespace    https://github.com/Evren-os
// @match        *://*.facebook.com/*
// @match        *://*.messenger.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(() => {
	if (typeof window !== "object" || typeof XMLHttpRequest !== "function") {
		return;
	}

	const PATCH_FLAG = Symbol.for("beAnonFb.storyPatch.v1_0_0");
	if (window[PATCH_FLAG]) {
		return;
	}
	window[PATCH_FLAG] = true;

	const XHR_URL_KEY = Symbol("beAnonFb.xhr.url");

	const GRAPHQL_URL_PATTERN = /(^|\/)api\/graphql\/?(?:[?#]|$)/i;

	const STORY_SEEN_MUTATION_PRIMARY = /\bstoriesUpdateSeenStateMutation\b/i;

	const STORY_SEEN_MUTATION_VARIANTS = [
		/\bStoryUpdateSeenState(?:Mutation)?\b/i,
		/\bupdateStorySeenState\b/i,
		/\bCometStoriesSeenMutation\b/i,
		/\bMarkStor\w*Seen\b/i,
	];

	const STORY_SEEN_MUTATION_INLINE =
		/fb_api_req_friendly_name["']?\s*[:=]\s*["']?storiesUpdateSeenState/i;

	const hasOwn = Object.prototype.hasOwnProperty;

	const originals = {
		xhrOpen: XMLHttpRequest.prototype.open,
		xhrSend: XMLHttpRequest.prototype.send,
		fetch:
			typeof window.fetch === "function" ? window.fetch.bind(window) : null,
	};

	// Helpers

	function normalizeUrl(input) {
		if (!input) {
			return "";
		}
		if (typeof input === "string") {
			try {
				return new URL(input, window.location.href).href;
			} catch (_error) {
				return input;
			}
		}
		if (input instanceof URL) {
			return input.href;
		}
		if (typeof input === "object" && typeof input.url === "string") {
			return normalizeUrl(input.url);
		}
		return "";
	}

	function typedArrayToString(uint8) {
		try {
			const MAX_BYTES = 8192;
			const slice =
				uint8.byteLength > MAX_BYTES ? uint8.subarray(0, MAX_BYTES) : uint8;
			if (typeof TextDecoder === "function") {
				return new TextDecoder().decode(slice);
			}
		} catch (_error) {
			// Ignore decoding failures
		}
		return "";
	}

	function formDataToString(formData) {
		const pairs = [];
		for (const [key, value] of formData.entries()) {
			if (typeof value === "string") {
				pairs.push(`${key}=${value}`);
			} else if (value && typeof value === "object" && "name" in value) {
				pairs.push(`${key}=${String(value.name)}`);
			} else {
				pairs.push(`${key}=[binary]`);
			}
		}
		return pairs.join("&");
	}

	function serializeBodySync(body) {
		if (body == null) {
			return "";
		}
		if (typeof body === "string") {
			return body;
		}
		if (body instanceof URLSearchParams) {
			return body.toString();
		}
		if (typeof FormData === "function" && body instanceof FormData) {
			return formDataToString(body);
		}
		if (body instanceof ArrayBuffer) {
			return typedArrayToString(new Uint8Array(body));
		}
		if (ArrayBuffer.isView(body)) {
			return typedArrayToString(
				new Uint8Array(body.buffer, body.byteOffset, body.byteLength),
			);
		}
		if (typeof Blob === "function" && body instanceof Blob) {
			return `[blob:${body.type}:${body.size}]`;
		}
		if (typeof body === "object") {
			try {
				return JSON.stringify(body);
			} catch (_error) {
				return "";
			}
		}
		try {
			return String(body);
		} catch (_error) {
			return "";
		}
	}

	function decodeIfUrlEncoded(text) {
		if (typeof text !== "string" || text.length === 0) {
			return "";
		}
		try {
			return decodeURIComponent(text.replace(/\+/g, "%20"));
		} catch (_error) {
			return text;
		}
	}

	function parseMutationName(bodyText) {
		const m = /(?:^|&)fb_api_req_friendly_name=([^&]+)/.exec(bodyText);
		if (!m) {
			return "";
		}
		try {
			return decodeURIComponent(m[1].replace(/\+/g, " "));
		} catch (_error) {
			return m[1];
		}
	}

	function testAnyVariant(text) {
		for (let i = 0; i < STORY_SEEN_MUTATION_VARIANTS.length; i += 1) {
			if (STORY_SEEN_MUTATION_VARIANTS[i].test(text)) {
				return true;
			}
		}
		return false;
	}

	function containsStorySeenMutation(bodyText) {
		if (!bodyText || typeof bodyText !== "string") {
			return false;
		}

		if (STORY_SEEN_MUTATION_PRIMARY.test(bodyText)) {
			return true;
		}

		const decoded = decodeIfUrlEncoded(bodyText);
		if (STORY_SEEN_MUTATION_PRIMARY.test(decoded)) {
			return true;
		}

		const mutationName = parseMutationName(decoded || bodyText);
		if (mutationName) {
			if (
				STORY_SEEN_MUTATION_PRIMARY.test(mutationName) ||
				testAnyVariant(mutationName)
			) {
				return true;
			}
		}

		if (
			STORY_SEEN_MUTATION_INLINE.test(bodyText) ||
			STORY_SEEN_MUTATION_INLINE.test(decoded)
		) {
			return true;
		}
		return testAnyVariant(bodyText) || testAnyVariant(decoded);
	}

	function shouldProbeRequestBody(url) {
		if (!url) {
			return true;
		}
		return GRAPHQL_URL_PATTERN.test(url);
	}

	async function serializeRequestBody(request) {
		try {
			const method = typeof request.method === "string" ? request.method : "";
			if (/^(GET|HEAD)$/i.test(method)) {
				return "";
			}
			return await request.clone().text();
		} catch (_error) {
			return "";
		}
	}

	function shouldBlock(url, bodyText) {
		if (!GRAPHQL_URL_PATTERN.test(url || "")) {
			return false;
		}
		return containsStorySeenMutation(bodyText);
	}

	function makeBlockedFetchResponse() {
		return new Response('{"data":{},"extensions":{"is_final":true}}', {
			status: 200,
			statusText: "OK",
			headers: {
				"Content-Type": "application/json; charset=utf-8",
				"Cache-Control": "no-store",
			},
		});
	}

	// XHR hooks

	XMLHttpRequest.prototype.open = function (...args) {
		const url = args[1];
		try {
			this[XHR_URL_KEY] = normalizeUrl(url);
		} catch (_error) {
			// Preserve native behavior even if instrumentation fails
		}
		return originals.xhrOpen.apply(this, args);
	};

	XMLHttpRequest.prototype.send = function (...args) {
		const requestUrl = hasOwn.call(this, XHR_URL_KEY) ? this[XHR_URL_KEY] : "";
		let bodyText = "";
		try {
			bodyText = serializeBodySync(args[0]);
		} catch (_error) {
			bodyText = "";
		}

		if (shouldBlock(requestUrl, bodyText)) {
			return undefined;
		}

		return originals.xhrSend.apply(this, args);
	};

	// Fetch hook

	if (originals.fetch) {
		window.fetch = async function (...args) {
			const resource = args[0];
			const init = args[1];
			const requestUrl = normalizeUrl(resource);
			let bodyText = "";

			const hasInitBody = !!(
				init &&
				typeof init === "object" &&
				hasOwn.call(init, "body")
			);

			if (hasInitBody) {
				bodyText = serializeBodySync(init.body);
			} else if (
				typeof Request === "function" &&
				resource instanceof Request &&
				shouldProbeRequestBody(requestUrl)
			) {
				bodyText = await serializeRequestBody(resource);
			}

			if (shouldBlock(requestUrl, bodyText)) {
				return makeBlockedFetchResponse();
			}

			return originals.fetch.apply(this, args);
		};
	}
})();
