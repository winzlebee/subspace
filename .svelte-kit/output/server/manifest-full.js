export const manifest = (() => {
function __memo(fn) {
	let value;
	return () => value ??= (value = fn());
}

return {
	appDir: "_app",
	appPath: "_app",
	assets: new Set(["favicon.png","svelte.svg","tauri.svg","vite.svg"]),
	mimeTypes: {".png":"image/png",".svg":"image/svg+xml"},
	_: {
		client: {start:"_app/immutable/entry/start.CFet9-0w.js",app:"_app/immutable/entry/app.D5pN__s4.js",imports:["_app/immutable/entry/start.CFet9-0w.js","_app/immutable/chunks/Dc5SRBTP.js","_app/immutable/chunks/jPXpONmM.js","_app/immutable/entry/app.D5pN__s4.js","_app/immutable/chunks/jPXpONmM.js","_app/immutable/chunks/Ci1e0nyO.js","_app/immutable/chunks/Dy-qOuCo.js","_app/immutable/chunks/bMZSfw0A.js","_app/immutable/chunks/C5ABWx1_.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:false},
		nodes: [
			__memo(() => import('./nodes/0.js')),
			__memo(() => import('./nodes/1.js')),
			__memo(() => import('./nodes/2.js'))
		],
		remotes: {
			
		},
		routes: [
			{
				id: "/",
				pattern: /^\/$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 2 },
				endpoint: null
			}
		],
		prerendered_routes: new Set([]),
		matchers: async () => {
			
			return {  };
		},
		server_assets: {}
	}
}
})();
