export const moment = {
	locale: () => {
		return 'en';
	}
}


/** @public */
export interface RequestUrlParam {
	/** @public */
	url: string;
	/** @public */
	method?: string;
	/** @public */
	contentType?: string;
	/** @public */
	body?: string | ArrayBuffer;
	/** @public */
	headers?: Record<string, string>;
	/** @public */
	throw?: boolean;
}

/** @public */
export interface RequestUrlResponse {
	/** @public */
	status: number;
	/** @public */
	headers: Record<string, string>;
	/** @public */
	arrayBuffer: ArrayBuffer;
	/** @public */
	json: any;
	/** @public */
	text: string;
}


export function requestUrl(request: RequestUrlParam): Promise<RequestUrlResponse> {
	return fetch(request.url, {
		method: request.method,
		headers: request.headers,
		body: request.body,
	}).then(async (response) => {
		if (response.status >= 400 && request.throw) {
			throw new Error(`Request failed, ${response.status}`);
		}

		// Turn response headers into Record<string, string> object
		const headers: Record<string, string> = {};
		response.headers.forEach((value, key) => {
			headers[key] = value;
		});

		const arraybuffer = await response.arrayBuffer();
		const text = arraybuffer ? new TextDecoder().decode(arraybuffer) : '';
		const json = text ? JSON.parse(text) : {};

		let response_body: RequestUrlResponse = {
			status: response.status,
			headers: headers,
			arrayBuffer: arraybuffer,
			json: json,
			text: text,
		};
		return response_body;
	});
}
