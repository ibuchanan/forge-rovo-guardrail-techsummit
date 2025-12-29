export { lifecycle } from "./forge/lifecycle";
export { logAssessment } from "./forge/logging";

import api, { route } from "@forge/api";
import type { FetchPagePayload } from "./actionpayload";

export function pickPage(payload: FetchPagePayload): FetchPagePayload | string {
  // console.debug(`Request: Explicit Page Id "${payload.pageId}"`);
  // console.debug(`Request: Rovo Context "${payload.context.confluence?.contentId}"`);
  if (payload.pageId) {
    return {
      pageId: payload.pageId,
      context: payload.context,
    };
  }
  if (payload.context.confluence?.contentId) {
    return {
      pageId: payload.context.confluence.contentId,
      context: payload.context,
    };
  }
  return "Could not find a Page Id in the current context";
}

export async function fetchPage(payload: FetchPagePayload): Promise<string> {
  const page = pickPage(payload);
  if (typeof page === "string") {
    return page;
  }
  console.debug(`Rovo sent pageId: ${payload.pageId}`);
  const id = payload.pageId ?? "0";
  try {
    const response = await api
      .asUser()
      .requestConfluence(
        route`/wiki/api/v2/pages/${id}?body-format=export_view`,
        {
          headers: {
            Accept: "application/json",
          },
        },
      );
    console.debug(`Response: ${response.status} ${response.statusText}`);
    // console.debug(JSON.stringify(await response.json()));
    if (response.ok) {
      console.debug(`Success: found "${id}"`);
      const responseJson = await response.json();
      const renderedResult = responseJson.body.export_view.value;
      // console.debug(`Content: ${JSON.stringify(renderedResult)}`);
      return renderedResult;
    }
    // TODO: check status codes and throw errors
    console.error(`Failed to fetch page: ${id}`);
    return `Failed to fetch page: ${id}`;
  } catch (error) {
    console.log(`Failed to fetch page due to: ${error}`);
    return `Failed to fetch page: ${id}`;
  }
}
