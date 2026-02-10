import "clsx";
import "../../chunks/stores.js";
function _layout($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { children } = $$props;
    $$renderer2.push(`<div class="h-screen w-screen overflow-hidden bg-base-200">`);
    children($$renderer2);
    $$renderer2.push(`<!----></div>`);
  });
}
export {
  _layout as default
};
