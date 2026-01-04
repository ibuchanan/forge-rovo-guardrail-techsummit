import api, { route } from "@forge/api";
import type { CommonEvent } from "../forge/events";

interface UserResponse {
  type: string;
  username: string;
  userKey: string;
  accountId: string;
  accountType: string;
  email: string;
  publicName: string;
  profilePicture: any;
  displayName: string;
  timeZone: string;
  externalCollaborator: boolean;
  isExternalCollaborator: boolean;
  isGuest: boolean;
  operations: any;
  details: any;
  personalSpace: any;
  _expandable: any;
  _links: any;
}

export async function myself(
  request: CommonEvent,
  _context: any,
): Promise<UserResponse | string> {
  // import { truncateEvents } from "../logging";
  // console.debug(`myself request: ${JSON.stringify(truncateEvents(request))}`);
  // console.debug(`myself context: ${JSON.stringify(truncateEvents(_context))}`);
  // console.debug(`myself request for ${request.context.moduleKey}`);
  try {
    const response = await api
      .asUser()
      .requestConfluence(route`/wiki/rest/api/user/current`);
    // console.debug(`myself response: ${response.status} ${response.statusText}`);
    // console.debug(JSON.stringify(await response.json()));
    if (response.ok) {
      // console.debug(`myself success`);
      const me = (await response.json()) as UserResponse;
      // console.debug(`myself user: [${me.displayName}](${me.accountId})`);
      return me;
    }
    // TODO: check status codes and throw errors
    console.error(`Failed: myself`);
    throw new Error(`Failed for myself\n`);
  } catch (error) {
    console.error(error);
    throw new Error(`Failed for myself\n`);
  }
}
