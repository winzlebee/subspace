import { H as HYDRATION_ERROR, C as COMMENT_NODE, a as HYDRATION_END, g as get_next_sibling, b as HYDRATION_START, c as HYDRATION_START_ELSE, e as effect_tracking, d as get, r as render_effect, s as source, u as untrack, i as increment, q as queue_micro_task, f as active_effect, h as block, j as branch, B as Batch, p as pause_effect, k as create_text, l as defer_effect, m as set_active_effect, n as set_active_reaction, o as set_component_context, t as handle_error, v as active_reaction, w as component_context, x as move_effect, y as set_signal_status, D as DIRTY, z as schedule_effect, M as MAYBE_DIRTY, A as internal_set, E as destroy_effect, F as invoke_error_boundary, G as svelte_boundary_reset_onerror, I as EFFECT_TRANSPARENT, J as EFFECT_PRESERVED, K as BOUNDARY_EFFECT, L as define_property, N as init_operations, O as get_first_child, P as hydration_failed, Q as clear_text_content, R as array_from, S as component_root, T as push, U as pop, V as set, W as LEGACY_PROPS, X as flushSync, Y as mutable_source, Z as STALE_REACTION, _ as noop, $ as ELEMENT_PRESERVE_ATTRIBUTE_CASE, a0 as ELEMENT_IS_INPUT, a1 as ELEMENT_IS_NAMESPACED } from "./runtime.js";
import { e as escape_html, s as set_ssr_context, a as ssr_context, p as push$1, b as pop$1, c as setContext } from "./context.js";
import { clsx as clsx$1 } from "clsx";
import * as devalue from "devalue";
import "./environment.js";
let public_env = {};
function set_private_env(environment) {
}
function set_public_env(environment) {
  public_env = environment;
}
function hydration_mismatch(location) {
  {
    console.warn(`https://svelte.dev/e/hydration_mismatch`);
  }
}
function svelte_boundary_reset_noop() {
  {
    console.warn(`https://svelte.dev/e/svelte_boundary_reset_noop`);
  }
}
let hydrating = false;
function set_hydrating(value) {
  hydrating = value;
}
let hydrate_node;
function set_hydrate_node(node) {
  if (node === null) {
    hydration_mismatch();
    throw HYDRATION_ERROR;
  }
  return hydrate_node = node;
}
function hydrate_next() {
  return set_hydrate_node(get_next_sibling(hydrate_node));
}
function next(count = 1) {
  if (hydrating) {
    var i = count;
    var node = hydrate_node;
    while (i--) {
      node = /** @type {TemplateNode} */
      get_next_sibling(node);
    }
    hydrate_node = node;
  }
}
function skip_nodes(remove = true) {
  var depth = 0;
  var node = hydrate_node;
  while (true) {
    if (node.nodeType === COMMENT_NODE) {
      var data = (
        /** @type {Comment} */
        node.data
      );
      if (data === HYDRATION_END) {
        if (depth === 0) return node;
        depth -= 1;
      } else if (data === HYDRATION_START || data === HYDRATION_START_ELSE) {
        depth += 1;
      }
    }
    var next2 = (
      /** @type {TemplateNode} */
      get_next_sibling(node)
    );
    if (remove) node.remove();
    node = next2;
  }
}
function createSubscriber(start) {
  let subscribers = 0;
  let version = source(0);
  let stop;
  return () => {
    if (effect_tracking()) {
      get(version);
      render_effect(() => {
        if (subscribers === 0) {
          stop = untrack(() => start(() => increment(version)));
        }
        subscribers += 1;
        return () => {
          queue_micro_task(() => {
            subscribers -= 1;
            if (subscribers === 0) {
              stop?.();
              stop = void 0;
              increment(version);
            }
          });
        };
      });
    }
  };
}
var flags = EFFECT_TRANSPARENT | EFFECT_PRESERVED | BOUNDARY_EFFECT;
function boundary(node, props, children) {
  new Boundary(node, props, children);
}
class Boundary {
  /** @type {Boundary | null} */
  parent;
  is_pending = false;
  /** @type {TemplateNode} */
  #anchor;
  /** @type {TemplateNode | null} */
  #hydrate_open = hydrating ? hydrate_node : null;
  /** @type {BoundaryProps} */
  #props;
  /** @type {((anchor: Node) => void)} */
  #children;
  /** @type {Effect} */
  #effect;
  /** @type {Effect | null} */
  #main_effect = null;
  /** @type {Effect | null} */
  #pending_effect = null;
  /** @type {Effect | null} */
  #failed_effect = null;
  /** @type {DocumentFragment | null} */
  #offscreen_fragment = null;
  /** @type {TemplateNode | null} */
  #pending_anchor = null;
  #local_pending_count = 0;
  #pending_count = 0;
  #pending_count_update_queued = false;
  #is_creating_fallback = false;
  /** @type {Set<Effect>} */
  #dirty_effects = /* @__PURE__ */ new Set();
  /** @type {Set<Effect>} */
  #maybe_dirty_effects = /* @__PURE__ */ new Set();
  /**
   * A source containing the number of pending async deriveds/expressions.
   * Only created if `$effect.pending()` is used inside the boundary,
   * otherwise updating the source results in needless `Batch.ensure()`
   * calls followed by no-op flushes
   * @type {Source<number> | null}
   */
  #effect_pending = null;
  #effect_pending_subscriber = createSubscriber(() => {
    this.#effect_pending = source(this.#local_pending_count);
    return () => {
      this.#effect_pending = null;
    };
  });
  /**
   * @param {TemplateNode} node
   * @param {BoundaryProps} props
   * @param {((anchor: Node) => void)} children
   */
  constructor(node, props, children) {
    this.#anchor = node;
    this.#props = props;
    this.#children = children;
    this.parent = /** @type {Effect} */
    active_effect.b;
    this.is_pending = !!this.#props.pending;
    this.#effect = block(() => {
      active_effect.b = this;
      if (hydrating) {
        const comment = this.#hydrate_open;
        hydrate_next();
        const server_rendered_pending = (
          /** @type {Comment} */
          comment.nodeType === COMMENT_NODE && /** @type {Comment} */
          comment.data === HYDRATION_START_ELSE
        );
        if (server_rendered_pending) {
          this.#hydrate_pending_content();
        } else {
          this.#hydrate_resolved_content();
          if (this.#pending_count === 0) {
            this.is_pending = false;
          }
        }
      } else {
        var anchor = this.#get_anchor();
        try {
          this.#main_effect = branch(() => children(anchor));
        } catch (error) {
          this.error(error);
        }
        if (this.#pending_count > 0) {
          this.#show_pending_snippet();
        } else {
          this.is_pending = false;
        }
      }
      return () => {
        this.#pending_anchor?.remove();
      };
    }, flags);
    if (hydrating) {
      this.#anchor = hydrate_node;
    }
  }
  #hydrate_resolved_content() {
    try {
      this.#main_effect = branch(() => this.#children(this.#anchor));
    } catch (error) {
      this.error(error);
    }
  }
  #hydrate_pending_content() {
    const pending = this.#props.pending;
    if (!pending) return;
    this.#pending_effect = branch(() => pending(this.#anchor));
    queue_micro_task(() => {
      var anchor = this.#get_anchor();
      this.#main_effect = this.#run(() => {
        Batch.ensure();
        return branch(() => this.#children(anchor));
      });
      if (this.#pending_count > 0) {
        this.#show_pending_snippet();
      } else {
        pause_effect(
          /** @type {Effect} */
          this.#pending_effect,
          () => {
            this.#pending_effect = null;
          }
        );
        this.is_pending = false;
      }
    });
  }
  #get_anchor() {
    var anchor = this.#anchor;
    if (this.is_pending) {
      this.#pending_anchor = create_text();
      this.#anchor.before(this.#pending_anchor);
      anchor = this.#pending_anchor;
    }
    return anchor;
  }
  /**
   * Defer an effect inside a pending boundary until the boundary resolves
   * @param {Effect} effect
   */
  defer_effect(effect) {
    defer_effect(effect, this.#dirty_effects, this.#maybe_dirty_effects);
  }
  /**
   * Returns `false` if the effect exists inside a boundary whose pending snippet is shown
   * @returns {boolean}
   */
  is_rendered() {
    return !this.is_pending && (!this.parent || this.parent.is_rendered());
  }
  has_pending_snippet() {
    return !!this.#props.pending;
  }
  /**
   * @param {() => Effect | null} fn
   */
  #run(fn) {
    var previous_effect = active_effect;
    var previous_reaction = active_reaction;
    var previous_ctx = component_context;
    set_active_effect(this.#effect);
    set_active_reaction(this.#effect);
    set_component_context(this.#effect.ctx);
    try {
      return fn();
    } catch (e) {
      handle_error(e);
      return null;
    } finally {
      set_active_effect(previous_effect);
      set_active_reaction(previous_reaction);
      set_component_context(previous_ctx);
    }
  }
  #show_pending_snippet() {
    const pending = (
      /** @type {(anchor: Node) => void} */
      this.#props.pending
    );
    if (this.#main_effect !== null) {
      this.#offscreen_fragment = document.createDocumentFragment();
      this.#offscreen_fragment.append(
        /** @type {TemplateNode} */
        this.#pending_anchor
      );
      move_effect(this.#main_effect, this.#offscreen_fragment);
    }
    if (this.#pending_effect === null) {
      this.#pending_effect = branch(() => pending(this.#anchor));
    }
  }
  /**
   * Updates the pending count associated with the currently visible pending snippet,
   * if any, such that we can replace the snippet with content once work is done
   * @param {1 | -1} d
   */
  #update_pending_count(d) {
    if (!this.has_pending_snippet()) {
      if (this.parent) {
        this.parent.#update_pending_count(d);
      }
      return;
    }
    this.#pending_count += d;
    if (this.#pending_count === 0) {
      this.is_pending = false;
      for (const e of this.#dirty_effects) {
        set_signal_status(e, DIRTY);
        schedule_effect(e);
      }
      for (const e of this.#maybe_dirty_effects) {
        set_signal_status(e, MAYBE_DIRTY);
        schedule_effect(e);
      }
      this.#dirty_effects.clear();
      this.#maybe_dirty_effects.clear();
      if (this.#pending_effect) {
        pause_effect(this.#pending_effect, () => {
          this.#pending_effect = null;
        });
      }
      if (this.#offscreen_fragment) {
        this.#anchor.before(this.#offscreen_fragment);
        this.#offscreen_fragment = null;
      }
    }
  }
  /**
   * Update the source that powers `$effect.pending()` inside this boundary,
   * and controls when the current `pending` snippet (if any) is removed.
   * Do not call from inside the class
   * @param {1 | -1} d
   */
  update_pending_count(d) {
    this.#update_pending_count(d);
    this.#local_pending_count += d;
    if (!this.#effect_pending || this.#pending_count_update_queued) return;
    this.#pending_count_update_queued = true;
    queue_micro_task(() => {
      this.#pending_count_update_queued = false;
      if (this.#effect_pending) {
        internal_set(this.#effect_pending, this.#local_pending_count);
      }
    });
  }
  get_effect_pending() {
    this.#effect_pending_subscriber();
    return get(
      /** @type {Source<number>} */
      this.#effect_pending
    );
  }
  /** @param {unknown} error */
  error(error) {
    var onerror = this.#props.onerror;
    let failed = this.#props.failed;
    if (this.#is_creating_fallback || !onerror && !failed) {
      throw error;
    }
    if (this.#main_effect) {
      destroy_effect(this.#main_effect);
      this.#main_effect = null;
    }
    if (this.#pending_effect) {
      destroy_effect(this.#pending_effect);
      this.#pending_effect = null;
    }
    if (this.#failed_effect) {
      destroy_effect(this.#failed_effect);
      this.#failed_effect = null;
    }
    if (hydrating) {
      set_hydrate_node(
        /** @type {TemplateNode} */
        this.#hydrate_open
      );
      next();
      set_hydrate_node(skip_nodes());
    }
    var did_reset = false;
    var calling_on_error = false;
    const reset = () => {
      if (did_reset) {
        svelte_boundary_reset_noop();
        return;
      }
      did_reset = true;
      if (calling_on_error) {
        svelte_boundary_reset_onerror();
      }
      Batch.ensure();
      this.#local_pending_count = 0;
      if (this.#failed_effect !== null) {
        pause_effect(this.#failed_effect, () => {
          this.#failed_effect = null;
        });
      }
      this.is_pending = this.has_pending_snippet();
      this.#main_effect = this.#run(() => {
        this.#is_creating_fallback = false;
        return branch(() => this.#children(this.#anchor));
      });
      if (this.#pending_count > 0) {
        this.#show_pending_snippet();
      } else {
        this.is_pending = false;
      }
    };
    queue_micro_task(() => {
      try {
        calling_on_error = true;
        onerror?.(error, reset);
        calling_on_error = false;
      } catch (error2) {
        invoke_error_boundary(error2, this.#effect && this.#effect.parent);
      }
      if (failed) {
        this.#failed_effect = this.#run(() => {
          Batch.ensure();
          this.#is_creating_fallback = true;
          try {
            return branch(() => {
              failed(
                this.#anchor,
                () => error,
                () => reset
              );
            });
          } catch (error2) {
            invoke_error_boundary(
              error2,
              /** @type {Effect} */
              this.#effect.parent
            );
            return null;
          } finally {
            this.#is_creating_fallback = false;
          }
        });
      }
    });
  }
}
const DOM_BOOLEAN_ATTRIBUTES = [
  "allowfullscreen",
  "async",
  "autofocus",
  "autoplay",
  "checked",
  "controls",
  "default",
  "disabled",
  "formnovalidate",
  "indeterminate",
  "inert",
  "ismap",
  "loop",
  "multiple",
  "muted",
  "nomodule",
  "novalidate",
  "open",
  "playsinline",
  "readonly",
  "required",
  "reversed",
  "seamless",
  "selected",
  "webkitdirectory",
  "defer",
  "disablepictureinpicture",
  "disableremoteplayback"
];
function is_boolean_attribute(name) {
  return DOM_BOOLEAN_ATTRIBUTES.includes(name);
}
const PASSIVE_EVENTS = ["touchstart", "touchmove"];
function is_passive_event(name) {
  return PASSIVE_EVENTS.includes(name);
}
const all_registered_events = /* @__PURE__ */ new Set();
const root_event_handles = /* @__PURE__ */ new Set();
let last_propagated_event = null;
function handle_event_propagation(event) {
  var handler_element = this;
  var owner_document = (
    /** @type {Node} */
    handler_element.ownerDocument
  );
  var event_name = event.type;
  var path = event.composedPath?.() || [];
  var current_target = (
    /** @type {null | Element} */
    path[0] || event.target
  );
  last_propagated_event = event;
  var path_idx = 0;
  var handled_at = last_propagated_event === event && event.__root;
  if (handled_at) {
    var at_idx = path.indexOf(handled_at);
    if (at_idx !== -1 && (handler_element === document || handler_element === /** @type {any} */
    window)) {
      event.__root = handler_element;
      return;
    }
    var handler_idx = path.indexOf(handler_element);
    if (handler_idx === -1) {
      return;
    }
    if (at_idx <= handler_idx) {
      path_idx = at_idx;
    }
  }
  current_target = /** @type {Element} */
  path[path_idx] || event.target;
  if (current_target === handler_element) return;
  define_property(event, "currentTarget", {
    configurable: true,
    get() {
      return current_target || owner_document;
    }
  });
  var previous_reaction = active_reaction;
  var previous_effect = active_effect;
  set_active_reaction(null);
  set_active_effect(null);
  try {
    var throw_error;
    var other_errors = [];
    while (current_target !== null) {
      var parent_element = current_target.assignedSlot || current_target.parentNode || /** @type {any} */
      current_target.host || null;
      try {
        var delegated = current_target["__" + event_name];
        if (delegated != null && (!/** @type {any} */
        current_target.disabled || // DOM could've been updated already by the time this is reached, so we check this as well
        // -> the target could not have been disabled because it emits the event in the first place
        event.target === current_target)) {
          delegated.call(current_target, event);
        }
      } catch (error) {
        if (throw_error) {
          other_errors.push(error);
        } else {
          throw_error = error;
        }
      }
      if (event.cancelBubble || parent_element === handler_element || parent_element === null) {
        break;
      }
      current_target = parent_element;
    }
    if (throw_error) {
      for (let error of other_errors) {
        queueMicrotask(() => {
          throw error;
        });
      }
      throw throw_error;
    }
  } finally {
    event.__root = handler_element;
    delete event.currentTarget;
    set_active_reaction(previous_reaction);
    set_active_effect(previous_effect);
  }
}
function assign_nodes(start, end) {
  var effect = (
    /** @type {Effect} */
    active_effect
  );
  if (effect.nodes === null) {
    effect.nodes = { start, end, a: null, t: null };
  }
}
function mount(component, options2) {
  return _mount(component, options2);
}
function hydrate(component, options2) {
  init_operations();
  options2.intro = options2.intro ?? false;
  const target = options2.target;
  const was_hydrating = hydrating;
  const previous_hydrate_node = hydrate_node;
  try {
    var anchor = get_first_child(target);
    while (anchor && (anchor.nodeType !== COMMENT_NODE || /** @type {Comment} */
    anchor.data !== HYDRATION_START)) {
      anchor = get_next_sibling(anchor);
    }
    if (!anchor) {
      throw HYDRATION_ERROR;
    }
    set_hydrating(true);
    set_hydrate_node(
      /** @type {Comment} */
      anchor
    );
    const instance = _mount(component, { ...options2, anchor });
    set_hydrating(false);
    return (
      /**  @type {Exports} */
      instance
    );
  } catch (error) {
    if (error instanceof Error && error.message.split("\n").some((line) => line.startsWith("https://svelte.dev/e/"))) {
      throw error;
    }
    if (error !== HYDRATION_ERROR) {
      console.warn("Failed to hydrate: ", error);
    }
    if (options2.recover === false) {
      hydration_failed();
    }
    init_operations();
    clear_text_content(target);
    set_hydrating(false);
    return mount(component, options2);
  } finally {
    set_hydrating(was_hydrating);
    set_hydrate_node(previous_hydrate_node);
  }
}
const document_listeners = /* @__PURE__ */ new Map();
function _mount(Component, { target, anchor, props = {}, events, context, intro = true }) {
  init_operations();
  var registered_events = /* @__PURE__ */ new Set();
  var event_handle = (events2) => {
    for (var i = 0; i < events2.length; i++) {
      var event_name = events2[i];
      if (registered_events.has(event_name)) continue;
      registered_events.add(event_name);
      var passive = is_passive_event(event_name);
      target.addEventListener(event_name, handle_event_propagation, { passive });
      var n = document_listeners.get(event_name);
      if (n === void 0) {
        document.addEventListener(event_name, handle_event_propagation, { passive });
        document_listeners.set(event_name, 1);
      } else {
        document_listeners.set(event_name, n + 1);
      }
    }
  };
  event_handle(array_from(all_registered_events));
  root_event_handles.add(event_handle);
  var component = void 0;
  var unmount2 = component_root(() => {
    var anchor_node = anchor ?? target.appendChild(create_text());
    boundary(
      /** @type {TemplateNode} */
      anchor_node,
      {
        pending: () => {
        }
      },
      (anchor_node2) => {
        push({});
        var ctx = (
          /** @type {ComponentContext} */
          component_context
        );
        if (context) ctx.c = context;
        if (events) {
          props.$$events = events;
        }
        if (hydrating) {
          assign_nodes(
            /** @type {TemplateNode} */
            anchor_node2,
            null
          );
        }
        component = Component(anchor_node2, props) || {};
        if (hydrating) {
          active_effect.nodes.end = hydrate_node;
          if (hydrate_node === null || hydrate_node.nodeType !== COMMENT_NODE || /** @type {Comment} */
          hydrate_node.data !== HYDRATION_END) {
            hydration_mismatch();
            throw HYDRATION_ERROR;
          }
        }
        pop();
      }
    );
    return () => {
      for (var event_name of registered_events) {
        target.removeEventListener(event_name, handle_event_propagation);
        var n = (
          /** @type {number} */
          document_listeners.get(event_name)
        );
        if (--n === 0) {
          document.removeEventListener(event_name, handle_event_propagation);
          document_listeners.delete(event_name);
        } else {
          document_listeners.set(event_name, n);
        }
      }
      root_event_handles.delete(event_handle);
      if (anchor_node !== anchor) {
        anchor_node.parentNode?.removeChild(anchor_node);
      }
    };
  });
  mounted_components.set(component, unmount2);
  return component;
}
let mounted_components = /* @__PURE__ */ new WeakMap();
function unmount(component, options2) {
  const fn = mounted_components.get(component);
  if (fn) {
    mounted_components.delete(component);
    return fn(options2);
  }
  return Promise.resolve();
}
const replacements = {
  translate: /* @__PURE__ */ new Map([
    [true, "yes"],
    [false, "no"]
  ])
};
function attr(name, value, is_boolean = false) {
  if (name === "hidden" && value !== "until-found") {
    is_boolean = true;
  }
  if (value == null || !value && is_boolean) return "";
  const normalized = name in replacements && replacements[name].get(value) || value;
  const assignment = is_boolean ? "" : `="${escape_html(normalized, true)}"`;
  return ` ${name}${assignment}`;
}
function clsx(value) {
  if (typeof value === "object") {
    return clsx$1(value);
  } else {
    return value ?? "";
  }
}
const whitespace = [..." 	\n\r\f \v\uFEFF"];
function to_class(value, hash, directives) {
  var classname = value == null ? "" : "" + value;
  if (hash) {
    classname = classname ? classname + " " + hash : hash;
  }
  if (directives) {
    for (var key in directives) {
      if (directives[key]) {
        classname = classname ? classname + " " + key : key;
      } else if (classname.length) {
        var len = key.length;
        var a = 0;
        while ((a = classname.indexOf(key, a)) >= 0) {
          var b = a + len;
          if ((a === 0 || whitespace.includes(classname[a - 1])) && (b === classname.length || whitespace.includes(classname[b]))) {
            classname = (a === 0 ? "" : classname.substring(0, a)) + classname.substring(b + 1);
          } else {
            a = b;
          }
        }
      }
    }
  }
  return classname === "" ? null : classname;
}
function append_styles(styles, important = false) {
  var separator = important ? " !important;" : ";";
  var css = "";
  for (var key in styles) {
    var value = styles[key];
    if (value != null && value !== "") {
      css += " " + key + ": " + value + separator;
    }
  }
  return css;
}
function to_css_name(name) {
  if (name[0] !== "-" || name[1] !== "-") {
    return name.toLowerCase();
  }
  return name;
}
function to_style(value, styles) {
  if (styles) {
    var new_style = "";
    var normal_styles;
    var important_styles;
    if (Array.isArray(styles)) {
      normal_styles = styles[0];
      important_styles = styles[1];
    } else {
      normal_styles = styles;
    }
    if (value) {
      value = String(value).replaceAll(/\s*\/\*.*?\*\/\s*/g, "").trim();
      var in_str = false;
      var in_apo = 0;
      var in_comment = false;
      var reserved_names = [];
      if (normal_styles) {
        reserved_names.push(...Object.keys(normal_styles).map(to_css_name));
      }
      if (important_styles) {
        reserved_names.push(...Object.keys(important_styles).map(to_css_name));
      }
      var start_index = 0;
      var name_index = -1;
      const len = value.length;
      for (var i = 0; i < len; i++) {
        var c = value[i];
        if (in_comment) {
          if (c === "/" && value[i - 1] === "*") {
            in_comment = false;
          }
        } else if (in_str) {
          if (in_str === c) {
            in_str = false;
          }
        } else if (c === "/" && value[i + 1] === "*") {
          in_comment = true;
        } else if (c === '"' || c === "'") {
          in_str = c;
        } else if (c === "(") {
          in_apo++;
        } else if (c === ")") {
          in_apo--;
        }
        if (!in_comment && in_str === false && in_apo === 0) {
          if (c === ":" && name_index === -1) {
            name_index = i;
          } else if (c === ";" || i === len - 1) {
            if (name_index !== -1) {
              var name = to_css_name(value.substring(start_index, name_index).trim());
              if (!reserved_names.includes(name)) {
                if (c !== ";") {
                  i++;
                }
                var property = value.substring(start_index, i).trim();
                new_style += " " + property + ";";
              }
            }
            start_index = i + 1;
            name_index = -1;
          }
        }
      }
    }
    if (normal_styles) {
      new_style += append_styles(normal_styles);
    }
    if (important_styles) {
      new_style += append_styles(important_styles, true);
    }
    new_style = new_style.trim();
    return new_style === "" ? null : new_style;
  }
  return value == null ? null : String(value);
}
function asClassComponent$1(component) {
  return class extends Svelte4Component {
    /** @param {any} options */
    constructor(options2) {
      super({
        component,
        ...options2
      });
    }
  };
}
class Svelte4Component {
  /** @type {any} */
  #events;
  /** @type {Record<string, any>} */
  #instance;
  /**
   * @param {ComponentConstructorOptions & {
   *  component: any;
   * }} options
   */
  constructor(options2) {
    var sources = /* @__PURE__ */ new Map();
    var add_source = (key, value) => {
      var s = mutable_source(value, false, false);
      sources.set(key, s);
      return s;
    };
    const props = new Proxy(
      { ...options2.props || {}, $$events: {} },
      {
        get(target, prop) {
          return get(sources.get(prop) ?? add_source(prop, Reflect.get(target, prop)));
        },
        has(target, prop) {
          if (prop === LEGACY_PROPS) return true;
          get(sources.get(prop) ?? add_source(prop, Reflect.get(target, prop)));
          return Reflect.has(target, prop);
        },
        set(target, prop, value) {
          set(sources.get(prop) ?? add_source(prop, value), value);
          return Reflect.set(target, prop, value);
        }
      }
    );
    this.#instance = (options2.hydrate ? hydrate : mount)(options2.component, {
      target: options2.target,
      anchor: options2.anchor,
      props,
      context: options2.context,
      intro: options2.intro ?? false,
      recover: options2.recover
    });
    if (!options2?.props?.$$host || options2.sync === false) {
      flushSync();
    }
    this.#events = props.$$events;
    for (const key of Object.keys(this.#instance)) {
      if (key === "$set" || key === "$destroy" || key === "$on") continue;
      define_property(this, key, {
        get() {
          return this.#instance[key];
        },
        /** @param {any} value */
        set(value) {
          this.#instance[key] = value;
        },
        enumerable: true
      });
    }
    this.#instance.$set = /** @param {Record<string, any>} next */
    (next2) => {
      Object.assign(props, next2);
    };
    this.#instance.$destroy = () => {
      unmount(this.#instance);
    };
  }
  /** @param {Record<string, any>} props */
  $set(props) {
    this.#instance.$set(props);
  }
  /**
   * @param {string} event
   * @param {(...args: any[]) => any} callback
   * @returns {any}
   */
  $on(event, callback) {
    this.#events[event] = this.#events[event] || [];
    const cb = (...args) => callback.call(this, ...args);
    this.#events[event].push(cb);
    return () => {
      this.#events[event] = this.#events[event].filter(
        /** @param {any} fn */
        (fn) => fn !== cb
      );
    };
  }
  $destroy() {
    this.#instance.$destroy();
  }
}
let read_implementation = null;
function set_read_implementation(fn) {
  read_implementation = fn;
}
function set_manifest(_) {
}
const BLOCK_OPEN = `<!--${HYDRATION_START}-->`;
const BLOCK_CLOSE = `<!--${HYDRATION_END}-->`;
let controller = null;
function abort() {
  controller?.abort(STALE_REACTION);
  controller = null;
}
function await_invalid() {
  const error = new Error(`await_invalid
Encountered asynchronous work while rendering synchronously.
https://svelte.dev/e/await_invalid`);
  error.name = "Svelte error";
  throw error;
}
function invalid_csp() {
  const error = new Error(`invalid_csp
\`csp.nonce\` was set while \`csp.hash\` was \`true\`. These options cannot be used simultaneously.
https://svelte.dev/e/invalid_csp`);
  error.name = "Svelte error";
  throw error;
}
function server_context_required() {
  const error = new Error(`server_context_required
Could not resolve \`render\` context.
https://svelte.dev/e/server_context_required`);
  error.name = "Svelte error";
  throw error;
}
function unresolved_hydratable(key, stack) {
  {
    console.warn(`https://svelte.dev/e/unresolved_hydratable`);
  }
}
function get_render_context() {
  const store = als?.getStore();
  {
    server_context_required();
  }
  return store;
}
let als = null;
let text_encoder;
let crypto;
async function sha256(data) {
  text_encoder ??= new TextEncoder();
  crypto ??= globalThis.crypto?.subtle?.digest ? globalThis.crypto : (
    // @ts-ignore - we don't install node types in the prod build
    // don't use 'node:crypto' because static analysers will think we rely on node when we don't
    (await import(
      /* @vite-ignore */
      "node:crypto"
    )).webcrypto
  );
  const hash_buffer = await crypto.subtle.digest("SHA-256", text_encoder.encode(data));
  return base64_encode(hash_buffer);
}
function base64_encode(bytes) {
  if (globalThis.Buffer) {
    return globalThis.Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
class Renderer {
  /**
   * The contents of the renderer.
   * @type {RendererItem[]}
   */
  #out = [];
  /**
   * Any `onDestroy` callbacks registered during execution of this renderer.
   * @type {(() => void)[] | undefined}
   */
  #on_destroy = void 0;
  /**
   * Whether this renderer is a component body.
   * @type {boolean}
   */
  #is_component_body = false;
  /**
   * The type of string content that this renderer is accumulating.
   * @type {RendererType}
   */
  type;
  /** @type {Renderer | undefined} */
  #parent;
  /**
   * Asynchronous work associated with this renderer
   * @type {Promise<void> | undefined}
   */
  promise = void 0;
  /**
   * State which is associated with the content tree as a whole.
   * It will be re-exposed, uncopied, on all children.
   * @type {SSRState}
   * @readonly
   */
  global;
  /**
   * State that is local to the branch it is declared in.
   * It will be shallow-copied to all children.
   *
   * @type {{ select_value: string | undefined }}
   */
  local;
  /**
   * @param {SSRState} global
   * @param {Renderer | undefined} [parent]
   */
  constructor(global, parent) {
    this.#parent = parent;
    this.global = global;
    this.local = parent ? { ...parent.local } : { select_value: void 0 };
    this.type = parent ? parent.type : "body";
  }
  /**
   * @param {(renderer: Renderer) => void} fn
   */
  head(fn) {
    const head = new Renderer(this.global, this);
    head.type = "head";
    this.#out.push(head);
    head.child(fn);
  }
  /**
   * @param {Array<Promise<void>>} blockers
   * @param {(renderer: Renderer) => void} fn
   */
  async_block(blockers, fn) {
    this.#out.push(BLOCK_OPEN);
    this.async(blockers, fn);
    this.#out.push(BLOCK_CLOSE);
  }
  /**
   * @param {Array<Promise<void>>} blockers
   * @param {(renderer: Renderer) => void} fn
   */
  async(blockers, fn) {
    let callback = fn;
    if (blockers.length > 0) {
      const context = ssr_context;
      callback = (renderer) => {
        return Promise.all(blockers).then(() => {
          const previous_context = ssr_context;
          try {
            set_ssr_context(context);
            return fn(renderer);
          } finally {
            set_ssr_context(previous_context);
          }
        });
      };
    }
    this.child(callback);
  }
  /**
   * @param {Array<() => void>} thunks
   */
  run(thunks) {
    const context = ssr_context;
    let promise = Promise.resolve(thunks[0]());
    const promises = [promise];
    for (const fn of thunks.slice(1)) {
      promise = promise.then(() => {
        const previous_context = ssr_context;
        set_ssr_context(context);
        try {
          return fn();
        } finally {
          set_ssr_context(previous_context);
        }
      });
      promises.push(promise);
    }
    promise.catch(noop);
    this.promise = promise;
    return promises;
  }
  /**
   * @param {(renderer: Renderer) => MaybePromise<void>} fn
   */
  child_block(fn) {
    this.#out.push(BLOCK_OPEN);
    this.child(fn);
    this.#out.push(BLOCK_CLOSE);
  }
  /**
   * Create a child renderer. The child renderer inherits the state from the parent,
   * but has its own content.
   * @param {(renderer: Renderer) => MaybePromise<void>} fn
   */
  child(fn) {
    const child = new Renderer(this.global, this);
    this.#out.push(child);
    const parent = ssr_context;
    set_ssr_context({
      ...ssr_context,
      p: parent,
      c: null,
      r: child
    });
    const result = fn(child);
    set_ssr_context(parent);
    if (result instanceof Promise) {
      if (child.global.mode === "sync") {
        await_invalid();
      }
      result.catch(() => {
      });
      child.promise = result;
    }
    return child;
  }
  /**
   * Create a component renderer. The component renderer inherits the state from the parent,
   * but has its own content. It is treated as an ordering boundary for ondestroy callbacks.
   * @param {(renderer: Renderer) => MaybePromise<void>} fn
   * @param {Function} [component_fn]
   * @returns {void}
   */
  component(fn, component_fn) {
    push$1();
    const child = this.child(fn);
    child.#is_component_body = true;
    pop$1();
  }
  /**
   * @param {Record<string, any>} attrs
   * @param {(renderer: Renderer) => void} fn
   * @param {string | undefined} [css_hash]
   * @param {Record<string, boolean> | undefined} [classes]
   * @param {Record<string, string> | undefined} [styles]
   * @param {number | undefined} [flags]
   * @param {boolean | undefined} [is_rich]
   * @returns {void}
   */
  select(attrs, fn, css_hash, classes, styles, flags2, is_rich) {
    const { value, ...select_attrs } = attrs;
    this.push(`<select${attributes(select_attrs, css_hash, classes, styles, flags2)}>`);
    this.child((renderer) => {
      renderer.local.select_value = value;
      fn(renderer);
    });
    this.push(`${is_rich ? "<!>" : ""}</select>`);
  }
  /**
   * @param {Record<string, any>} attrs
   * @param {string | number | boolean | ((renderer: Renderer) => void)} body
   * @param {string | undefined} [css_hash]
   * @param {Record<string, boolean> | undefined} [classes]
   * @param {Record<string, string> | undefined} [styles]
   * @param {number | undefined} [flags]
   * @param {boolean | undefined} [is_rich]
   */
  option(attrs, body, css_hash, classes, styles, flags2, is_rich) {
    this.#out.push(`<option${attributes(attrs, css_hash, classes, styles, flags2)}`);
    const close = (renderer, value, { head, body: body2 }) => {
      if ("value" in attrs) {
        value = attrs.value;
      }
      if (value === this.local.select_value) {
        renderer.#out.push(" selected");
      }
      renderer.#out.push(`>${body2}${is_rich ? "<!>" : ""}</option>`);
      if (head) {
        renderer.head((child) => child.push(head));
      }
    };
    if (typeof body === "function") {
      this.child((renderer) => {
        const r = new Renderer(this.global, this);
        body(r);
        if (this.global.mode === "async") {
          return r.#collect_content_async().then((content) => {
            close(renderer, content.body.replaceAll("<!---->", ""), content);
          });
        } else {
          const content = r.#collect_content();
          close(renderer, content.body.replaceAll("<!---->", ""), content);
        }
      });
    } else {
      close(this, body, { body });
    }
  }
  /**
   * @param {(renderer: Renderer) => void} fn
   */
  title(fn) {
    const path = this.get_path();
    const close = (head) => {
      this.global.set_title(head, path);
    };
    this.child((renderer) => {
      const r = new Renderer(renderer.global, renderer);
      fn(r);
      if (renderer.global.mode === "async") {
        return r.#collect_content_async().then((content) => {
          close(content.head);
        });
      } else {
        const content = r.#collect_content();
        close(content.head);
      }
    });
  }
  /**
   * @param {string | (() => Promise<string>)} content
   */
  push(content) {
    if (typeof content === "function") {
      this.child(async (renderer) => renderer.push(await content()));
    } else {
      this.#out.push(content);
    }
  }
  /**
   * @param {() => void} fn
   */
  on_destroy(fn) {
    (this.#on_destroy ??= []).push(fn);
  }
  /**
   * @returns {number[]}
   */
  get_path() {
    return this.#parent ? [...this.#parent.get_path(), this.#parent.#out.indexOf(this)] : [];
  }
  /**
   * @deprecated this is needed for legacy component bindings
   */
  copy() {
    const copy = new Renderer(this.global, this.#parent);
    copy.#out = this.#out.map((item) => item instanceof Renderer ? item.copy() : item);
    copy.promise = this.promise;
    return copy;
  }
  /**
   * @param {Renderer} other
   * @deprecated this is needed for legacy component bindings
   */
  subsume(other) {
    if (this.global.mode !== other.global.mode) {
      throw new Error(
        "invariant: A renderer cannot switch modes. If you're seeing this, there's a compiler bug. File an issue!"
      );
    }
    this.local = other.local;
    this.#out = other.#out.map((item) => {
      if (item instanceof Renderer) {
        item.subsume(item);
      }
      return item;
    });
    this.promise = other.promise;
    this.type = other.type;
  }
  get length() {
    return this.#out.length;
  }
  /**
   * Only available on the server and when compiling with the `server` option.
   * Takes a component and returns an object with `body` and `head` properties on it, which you can use to populate the HTML when server-rendering your app.
   * @template {Record<string, any>} Props
   * @param {Component<Props>} component
   * @param {{ props?: Omit<Props, '$$slots' | '$$events'>; context?: Map<any, any>; idPrefix?: string; csp?: Csp }} [options]
   * @returns {RenderOutput}
   */
  static render(component, options2 = {}) {
    let sync;
    const result = (
      /** @type {RenderOutput} */
      {}
    );
    Object.defineProperties(result, {
      html: {
        get: () => {
          return (sync ??= Renderer.#render(component, options2)).body;
        }
      },
      head: {
        get: () => {
          return (sync ??= Renderer.#render(component, options2)).head;
        }
      },
      body: {
        get: () => {
          return (sync ??= Renderer.#render(component, options2)).body;
        }
      },
      hashes: {
        value: {
          script: ""
        }
      },
      then: {
        value: (
          /**
           * this is not type-safe, but honestly it's the best I can do right now, and it's a straightforward function.
           *
           * @template TResult1
           * @template [TResult2=never]
           * @param { (value: SyncRenderOutput) => TResult1 } onfulfilled
           * @param { (reason: unknown) => TResult2 } onrejected
           */
          (onfulfilled, onrejected) => {
            {
              const result2 = sync ??= Renderer.#render(component, options2);
              const user_result = onfulfilled({
                head: result2.head,
                body: result2.body,
                html: result2.body,
                hashes: { script: [] }
              });
              return Promise.resolve(user_result);
            }
          }
        )
      }
    });
    return result;
  }
  /**
   * Collect all of the `onDestroy` callbacks registered during rendering. In an async context, this is only safe to call
   * after awaiting `collect_async`.
   *
   * Child renderers are "porous" and don't affect execution order, but component body renderers
   * create ordering boundaries. Within a renderer, callbacks run in order until hitting a component boundary.
   * @returns {Iterable<() => void>}
   */
  *#collect_on_destroy() {
    for (const component of this.#traverse_components()) {
      yield* component.#collect_ondestroy();
    }
  }
  /**
   * Performs a depth-first search of renderers, yielding the deepest components first, then additional components as we backtrack up the tree.
   * @returns {Iterable<Renderer>}
   */
  *#traverse_components() {
    for (const child of this.#out) {
      if (typeof child !== "string") {
        yield* child.#traverse_components();
      }
    }
    if (this.#is_component_body) {
      yield this;
    }
  }
  /**
   * @returns {Iterable<() => void>}
   */
  *#collect_ondestroy() {
    if (this.#on_destroy) {
      for (const fn of this.#on_destroy) {
        yield fn;
      }
    }
    for (const child of this.#out) {
      if (child instanceof Renderer && !child.#is_component_body) {
        yield* child.#collect_ondestroy();
      }
    }
  }
  /**
   * Render a component. Throws if any of the children are performing asynchronous work.
   *
   * @template {Record<string, any>} Props
   * @param {Component<Props>} component
   * @param {{ props?: Omit<Props, '$$slots' | '$$events'>; context?: Map<any, any>; idPrefix?: string }} options
   * @returns {AccumulatedContent}
   */
  static #render(component, options2) {
    var previous_context = ssr_context;
    try {
      const renderer = Renderer.#open_render("sync", component, options2);
      const content = renderer.#collect_content();
      return Renderer.#close_render(content, renderer);
    } finally {
      abort();
      set_ssr_context(previous_context);
    }
  }
  /**
   * Render a component.
   *
   * @template {Record<string, any>} Props
   * @param {Component<Props>} component
   * @param {{ props?: Omit<Props, '$$slots' | '$$events'>; context?: Map<any, any>; idPrefix?: string; csp?: Csp }} options
   * @returns {Promise<AccumulatedContent & { hashes: { script: Sha256Source[] } }>}
   */
  static async #render_async(component, options2) {
    const previous_context = ssr_context;
    try {
      const renderer = Renderer.#open_render("async", component, options2);
      const content = await renderer.#collect_content_async();
      const hydratables = await renderer.#collect_hydratables();
      if (hydratables !== null) {
        content.head = hydratables + content.head;
      }
      return Renderer.#close_render(content, renderer);
    } finally {
      set_ssr_context(previous_context);
      abort();
    }
  }
  /**
   * Collect all of the code from the `out` array and return it as a string, or a promise resolving to a string.
   * @param {AccumulatedContent} content
   * @returns {AccumulatedContent}
   */
  #collect_content(content = { head: "", body: "" }) {
    for (const item of this.#out) {
      if (typeof item === "string") {
        content[this.type] += item;
      } else if (item instanceof Renderer) {
        item.#collect_content(content);
      }
    }
    return content;
  }
  /**
   * Collect all of the code from the `out` array and return it as a string.
   * @param {AccumulatedContent} content
   * @returns {Promise<AccumulatedContent>}
   */
  async #collect_content_async(content = { head: "", body: "" }) {
    await this.promise;
    for (const item of this.#out) {
      if (typeof item === "string") {
        content[this.type] += item;
      } else if (item instanceof Renderer) {
        await item.#collect_content_async(content);
      }
    }
    return content;
  }
  async #collect_hydratables() {
    const ctx = get_render_context().hydratable;
    for (const [_, key] of ctx.unresolved_promises) {
      unresolved_hydratable(key, ctx.lookup.get(key)?.stack ?? "<missing stack trace>");
    }
    for (const comparison of ctx.comparisons) {
      await comparison;
    }
    return await this.#hydratable_block(ctx);
  }
  /**
   * @template {Record<string, any>} Props
   * @param {'sync' | 'async'} mode
   * @param {import('svelte').Component<Props>} component
   * @param {{ props?: Omit<Props, '$$slots' | '$$events'>; context?: Map<any, any>; idPrefix?: string; csp?: Csp }} options
   * @returns {Renderer}
   */
  static #open_render(mode, component, options2) {
    const renderer = new Renderer(
      new SSRState(mode, options2.idPrefix ? options2.idPrefix + "-" : "", options2.csp)
    );
    renderer.push(BLOCK_OPEN);
    push$1();
    if (options2.context) ssr_context.c = options2.context;
    ssr_context.r = renderer;
    component(renderer, options2.props ?? {});
    pop$1();
    renderer.push(BLOCK_CLOSE);
    return renderer;
  }
  /**
   * @param {AccumulatedContent} content
   * @param {Renderer} renderer
   * @returns {AccumulatedContent & { hashes: { script: Sha256Source[] } }}
   */
  static #close_render(content, renderer) {
    for (const cleanup of renderer.#collect_on_destroy()) {
      cleanup();
    }
    let head = content.head + renderer.global.get_title();
    let body = content.body;
    for (const { hash, code } of renderer.global.css) {
      head += `<style id="${hash}">${code}</style>`;
    }
    return {
      head,
      body,
      hashes: {
        script: renderer.global.csp.script_hashes
      }
    };
  }
  /**
   * @param {HydratableContext} ctx
   */
  async #hydratable_block(ctx) {
    if (ctx.lookup.size === 0) {
      return null;
    }
    let entries = [];
    let has_promises = false;
    for (const [k, v] of ctx.lookup) {
      if (v.promises) {
        has_promises = true;
        for (const p of v.promises) await p;
      }
      entries.push(`[${devalue.uneval(k)},${v.serialized}]`);
    }
    let prelude = `const h = (window.__svelte ??= {}).h ??= new Map();`;
    if (has_promises) {
      prelude = `const r = (v) => Promise.resolve(v);
				${prelude}`;
    }
    const body = `
			{
				${prelude}

				for (const [k, v] of [
					${entries.join(",\n					")}
				]) {
					h.set(k, v);
				}
			}
		`;
    let csp_attr = "";
    if (this.global.csp.nonce) {
      csp_attr = ` nonce="${this.global.csp.nonce}"`;
    } else if (this.global.csp.hash) {
      const hash = await sha256(body);
      this.global.csp.script_hashes.push(`sha256-${hash}`);
    }
    return `
		<script${csp_attr}>${body}<\/script>`;
  }
}
class SSRState {
  /** @readonly @type {Csp & { script_hashes: Sha256Source[] }} */
  csp;
  /** @readonly @type {'sync' | 'async'} */
  mode;
  /** @readonly @type {() => string} */
  uid;
  /** @readonly @type {Set<{ hash: string; code: string }>} */
  css = /* @__PURE__ */ new Set();
  /** @type {{ path: number[], value: string }} */
  #title = { path: [], value: "" };
  /**
   * @param {'sync' | 'async'} mode
   * @param {string} id_prefix
   * @param {Csp} csp
   */
  constructor(mode, id_prefix = "", csp = { hash: false }) {
    this.mode = mode;
    this.csp = { ...csp, script_hashes: [] };
    let uid = 1;
    this.uid = () => `${id_prefix}s${uid++}`;
  }
  get_title() {
    return this.#title.value;
  }
  /**
   * Performs a depth-first (lexicographic) comparison using the path. Rejects sets
   * from earlier than or equal to the current value.
   * @param {string} value
   * @param {number[]} path
   */
  set_title(value, path) {
    const current = this.#title.path;
    let i = 0;
    let l = Math.min(path.length, current.length);
    while (i < l && path[i] === current[i]) i += 1;
    if (path[i] === void 0) return;
    if (current[i] === void 0 || path[i] > current[i]) {
      this.#title.path = path;
      this.#title.value = value;
    }
  }
}
const INVALID_ATTR_NAME_CHAR_REGEX = /[\s'">/=\u{FDD0}-\u{FDEF}\u{FFFE}\u{FFFF}\u{1FFFE}\u{1FFFF}\u{2FFFE}\u{2FFFF}\u{3FFFE}\u{3FFFF}\u{4FFFE}\u{4FFFF}\u{5FFFE}\u{5FFFF}\u{6FFFE}\u{6FFFF}\u{7FFFE}\u{7FFFF}\u{8FFFE}\u{8FFFF}\u{9FFFE}\u{9FFFF}\u{AFFFE}\u{AFFFF}\u{BFFFE}\u{BFFFF}\u{CFFFE}\u{CFFFF}\u{DFFFE}\u{DFFFF}\u{EFFFE}\u{EFFFF}\u{FFFFE}\u{FFFFF}\u{10FFFE}\u{10FFFF}]/u;
function render(component, options2 = {}) {
  if (options2.csp?.hash && options2.csp.nonce) {
    invalid_csp();
  }
  return Renderer.render(
    /** @type {Component<Props>} */
    component,
    options2
  );
}
function attributes(attrs, css_hash, classes, styles, flags2 = 0) {
  if (styles) {
    attrs.style = to_style(attrs.style, styles);
  }
  if (attrs.class) {
    attrs.class = clsx(attrs.class);
  }
  if (css_hash || classes) {
    attrs.class = to_class(attrs.class, css_hash, classes);
  }
  let attr_str = "";
  let name;
  const is_html = (flags2 & ELEMENT_IS_NAMESPACED) === 0;
  const lowercase = (flags2 & ELEMENT_PRESERVE_ATTRIBUTE_CASE) === 0;
  const is_input = (flags2 & ELEMENT_IS_INPUT) !== 0;
  for (name in attrs) {
    if (typeof attrs[name] === "function") continue;
    if (name[0] === "$" && name[1] === "$") continue;
    if (INVALID_ATTR_NAME_CHAR_REGEX.test(name)) continue;
    var value = attrs[name];
    if (lowercase) {
      name = name.toLowerCase();
    }
    if (is_input) {
      if (name === "defaultvalue" || name === "defaultchecked") {
        name = name === "defaultvalue" ? "value" : "checked";
        if (attrs[name]) continue;
      }
    }
    attr_str += attr(name, value, is_html && is_boolean_attribute(name));
  }
  return attr_str;
}
function asClassComponent(component) {
  const component_constructor = asClassComponent$1(component);
  const _render = (props, { context, csp } = {}) => {
    const result = render(component, { props, context, csp });
    const munged = Object.defineProperties(
      /** @type {LegacyRenderResult & PromiseLike<LegacyRenderResult>} */
      {},
      {
        css: {
          value: { code: "", map: null }
        },
        head: {
          get: () => result.head
        },
        html: {
          get: () => result.body
        },
        then: {
          /**
           * this is not type-safe, but honestly it's the best I can do right now, and it's a straightforward function.
           *
           * @template TResult1
           * @template [TResult2=never]
           * @param { (value: LegacyRenderResult) => TResult1 } onfulfilled
           * @param { (reason: unknown) => TResult2 } onrejected
           */
          value: (onfulfilled, onrejected) => {
            {
              const user_result = onfulfilled({
                css: munged.css,
                head: munged.head,
                html: munged.html
              });
              return Promise.resolve(user_result);
            }
          }
        }
      }
    );
    return munged;
  };
  component_constructor.render = _render;
  return component_constructor;
}
function Root($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let {
      stores,
      page,
      constructors,
      components = [],
      form,
      data_0 = null,
      data_1 = null
    } = $$props;
    {
      setContext("__svelte__", stores);
    }
    {
      stores.page.set(page);
    }
    const Pyramid_1 = constructors[1];
    if (constructors[1]) {
      $$renderer2.push("<!--[-->");
      const Pyramid_0 = constructors[0];
      $$renderer2.push("<!---->");
      Pyramid_0?.($$renderer2, {
        data: data_0,
        form,
        params: page.params,
        children: ($$renderer3) => {
          $$renderer3.push("<!---->");
          Pyramid_1?.($$renderer3, { data: data_1, form, params: page.params });
          $$renderer3.push(`<!---->`);
        },
        $$slots: { default: true }
      });
      $$renderer2.push(`<!---->`);
    } else {
      $$renderer2.push("<!--[!-->");
      const Pyramid_0 = constructors[0];
      $$renderer2.push("<!---->");
      Pyramid_0?.($$renderer2, { data: data_0, form, params: page.params });
      $$renderer2.push(`<!---->`);
    }
    $$renderer2.push(`<!--]--> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]-->`);
  });
}
const root = asClassComponent(Root);
const options = {
  app_template_contains_nonce: false,
  async: false,
  csp: { "mode": "auto", "directives": { "upgrade-insecure-requests": false, "block-all-mixed-content": false }, "reportOnly": { "upgrade-insecure-requests": false, "block-all-mixed-content": false } },
  csrf_check_origin: true,
  csrf_trusted_origins: [],
  embedded: false,
  env_public_prefix: "PUBLIC_",
  env_private_prefix: "",
  hash_routing: false,
  hooks: null,
  // added lazily, via `get_hooks`
  preload_strategy: "modulepreload",
  root,
  service_worker: false,
  service_worker_options: void 0,
  templates: {
    app: ({ head, body, assets, nonce, env }) => '<!doctype html>\n<html lang="en" data-theme="subspace-dark">\n  <head>\n    <meta charset="utf-8" />\n    <link rel="icon" href="' + assets + '/favicon.png" />\n    <meta name="viewport" content="width=device-width, initial-scale=1" />\n    <link rel="preconnect" href="https://fonts.googleapis.com" />\n    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />\n    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />\n    <title>Subspace</title>\n    ' + head + '\n  </head>\n  <body data-sveltekit-preload-data="hover">\n    <div style="display: contents">' + body + "</div>\n  </body>\n</html>\n",
    error: ({ status, message }) => '<!doctype html>\n<html lang="en">\n	<head>\n		<meta charset="utf-8" />\n		<title>' + message + `</title>

		<style>
			body {
				--bg: white;
				--fg: #222;
				--divider: #ccc;
				background: var(--bg);
				color: var(--fg);
				font-family:
					system-ui,
					-apple-system,
					BlinkMacSystemFont,
					'Segoe UI',
					Roboto,
					Oxygen,
					Ubuntu,
					Cantarell,
					'Open Sans',
					'Helvetica Neue',
					sans-serif;
				display: flex;
				align-items: center;
				justify-content: center;
				height: 100vh;
				margin: 0;
			}

			.error {
				display: flex;
				align-items: center;
				max-width: 32rem;
				margin: 0 1rem;
			}

			.status {
				font-weight: 200;
				font-size: 3rem;
				line-height: 1;
				position: relative;
				top: -0.05rem;
			}

			.message {
				border-left: 1px solid var(--divider);
				padding: 0 0 0 1rem;
				margin: 0 0 0 1rem;
				min-height: 2.5rem;
				display: flex;
				align-items: center;
			}

			.message h1 {
				font-weight: 400;
				font-size: 1em;
				margin: 0;
			}

			@media (prefers-color-scheme: dark) {
				body {
					--bg: #222;
					--fg: #ddd;
					--divider: #666;
				}
			}
		</style>
	</head>
	<body>
		<div class="error">
			<span class="status">` + status + '</span>\n			<div class="message">\n				<h1>' + message + "</h1>\n			</div>\n		</div>\n	</body>\n</html>\n"
  },
  version_hash: "1gegje9"
};
async function get_hooks() {
  let handle;
  let handleFetch;
  let handleError;
  let handleValidationError;
  let init;
  let reroute;
  let transport;
  return {
    handle,
    handleFetch,
    handleError,
    handleValidationError,
    init,
    reroute,
    transport
  };
}
export {
  set_public_env as a,
  set_read_implementation as b,
  set_manifest as c,
  get_hooks as g,
  options as o,
  public_env as p,
  read_implementation as r,
  set_private_env as s
};
