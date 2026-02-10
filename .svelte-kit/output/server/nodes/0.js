

export const index = 0;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/_layout.svelte.js')).default;
export const universal = {
  "ssr": false
};
export const universal_id = "src/routes/+layout.ts";
export const imports = ["_app/immutable/nodes/0.DRUlEdHQ.js","_app/immutable/chunks/Dy-qOuCo.js","_app/immutable/chunks/jPXpONmM.js","_app/immutable/chunks/C5ABWx1_.js","_app/immutable/chunks/QhsLRqcb.js"];
export const stylesheets = ["_app/immutable/assets/0.D3F4egR_.css"];
export const fonts = [];
