declare module "enhanced-resolve/lib/getInnerRequest.js" {
  import type { Resolver, ResolveRequest } from "enhanced-resolve";

  export default function getInnerRequest(
    resolver: Resolver,
    request: ResolveRequest
  ): string | undefined;
}

declare module "enhanced-resolve/lib/createInnerContext.js" {
  import type { ResolveContext } from "enhanced-resolve";

  export default function createInnerContext(
    options: Partial<ResolveContext>
  ): ResolveContext;
}