---
title: Opaque Types — TypeDoc
summary: Keeping type inference machinery out of the generated API docs while the signatures that use it stay documented
description: |
  Design note for a local TypeDoc plugin that blanks tagged type alias bodies and elides references to symbols
  excluded from the docs.
---

# Abstract

The value a shape describes is resolved by a chain of helper types (`Retrieved`, `Submitted`, `Carried`, `Loose`,
`Content`, `Declared`, …) that map a shape to its instance type. They are exported so that the public aliases and the
type tests can reach them, but they are of no interest to a consumer, who reads the docs of `Instance`, `Proposal` and
`property()` and expects to learn what those resolve to, not how.

TypeDoc offers no way to keep an alias documented while hiding its body: `@internal`, `@hidden` and `@ignore` drop the
helpers but leave their names dangling, unlinked, in every public signature that references them, and `@inline` and
`@expand` go the opposite way, pasting the machinery in place. The approach below is a local plugin that renders a
tagged alias body as an ellipsis and turns every reference to a symbol left out of the docs into an ellipsis as well, so
the prose on the public symbol is the whole of what a reader sees.

# Context

Three public signatures leak the helpers:

| Symbol         | Leak                                                          |
|----------------|---------------------------------------------------------------|
| `Instance<S>`  | body names `Retrieved<E>`                                     |
| `Proposal<S>`  | body names `Submitted<E>`                                     |
| `property()`   | return type names `Declared<C, "minCount">` and `"maxCount"`  |

Every other reference to a helper sits inside the helper block itself and disappears with it. The helpers stay exported
from `resource.ts`, as `index.ts` and the type tests import them; only what TypeDoc renders changes. TypeScript hover
text in the IDE shows the machinery regardless, since a `.d.ts` cannot hide an alias body.

Two GitHub requests for a built-in switch, [#2032](https://github.com/TypeStrong/typedoc/issues/2032) and
[#2273](https://github.com/TypeStrong/typedoc/issues/2273), closed without one, and the shipped tags
([`@inline`](https://typedoc.org/documents/Tags._inline.html),
[`@expand`](https://typedoc.org/documents/Tags._expand.html), `@inlineType`, `@preventInline`) only add detail. A [plugin](https://typedoc.org/documents/Development.Plugins.html) is
the remaining route.

# Solution

The plugin provides two guarantees, and each public symbol relies on one of them:

- **An `@opaque` alias renders as `Name: …`.** Its body is replaced wholesale, so the prose and `@typeParam` notes
  carry the full description. `Instance` and `Proposal` are tagged this way, and their comments MUST therefore state
  the resolved shape in full: identifier IRI, optional type, property values by cardinality, members left optional.
- **A reference to a symbol left out of the docs renders as `…`.** Any reference that resolves to nothing in the
  project, whether the target carries `@internal` or lives in a file that is not an entry point, is elided in every
  type TypeDoc renders: alias bodies, signatures, parameters and type parameter bounds. `property()` relies on this
  once `Declared` is `@internal`, rendering as `C & PropertyConstraints & Range<R, …, …> & { kind: "property" }`.

The second guarantee is a safety net as well: any helper that leaks into a future public signature renders as `…`
rather than as a dead name, with no per-site tagging.

## Plugin

Verified against TypeDoc 0.28.14. The file MUST live inside the project so that it resolves the `typedoc` package.

```javascript
// typedoc.plugin.mjs

import { Application, Converter, ReferenceType, ReflectionKind, UnknownType } from "typedoc";

const OPAQUE = "@opaque";
const ELLIPSIS = "…";

export function load(app) {

	app.on(Application.EVENT_BOOTSTRAP_END, () => {
		app.options.setValue("modifierTags", [...app.options.getValue("modifierTags"), OPAQUE]);
	});

	app.converter.on(Converter.EVENT_RESOLVE_BEGIN, context => {
		context.project.getReflectionsByKind(ReflectionKind.TypeAlias)
			.filter(reflection => reflection.comment?.hasModifier(OPAQUE))
			.forEach(reflection => {
				reflection.type = new UnknownType(ELLIPSIS);
				reflection.comment.removeModifier(OPAQUE);
			});
	});

	app.converter.on(Converter.EVENT_RESOLVE_END, context => {

		const { project } = context;

		const hidden = type => type instanceof ReferenceType
			&& !type.reflection && !type.externalUrl && type.package === project.packageName;

		const elide = type => !type ? type
			: hidden(type) ? new UnknownType(ELLIPSIS)
				: visit(type);

		const visit = type => {
			Object.entries(type).forEach(([key, value]) => {
				if ( Array.isArray(value) ) {
					type[key] = value.map(item => item && typeof item.type === "string" ? elide(item) : item);
				} else if ( value && typeof value === "object" && typeof value.type === "string" && key !== "reflection" ) {
					type[key] = elide(value);
				}
			});
			return type;
		};

		Object.values(project.reflections).forEach(reflection => {
			reflection.type = elide(reflection.type);
			reflection.signatures?.forEach(signature => { signature.type = elide(signature.type); });
			reflection.parameters?.forEach(parameter => { parameter.type = elide(parameter.type); });
			reflection.typeParameters?.forEach(parameter => {
				parameter.type = elide(parameter.type);
				parameter.default = elide(parameter.default);
			});
		});

	});

}
```

The plugin registers `@opaque` on bootstrap, extending the default modifier list rather than replacing it. Listing
`modifierTags` in `typedoc.json` instead would drop the defaults, and `@internal` would then become an unknown block
tag and `excludeInternal` would silently stop excluding anything.

## Configuration

```json
{
  "plugin": ["./typedoc.plugin.mjs"],
  "excludeInternal": true
}
```

## Tagging

- Every helper alias in the inference block of `resource.ts` carries `@internal`; the `Foreign` and `Managed` marker
  types included, as they are consumed by the helpers alone.
- `Instance`, `Proposal` and `Plain` carry `@opaque`, placed as a modifier after the block tags.
- Nothing on `property()` changes: its `Declared` bounds are elided by the second guarantee.

# Limitations

- **Flattened intersections.** `C & Property<R, …>` renders as `C & PropertyConstraints & Range<R, …, …> & { kind:
  "property" }`: TypeScript drops the `Property` alias name inside an intersection before TypeDoc sees it. Unrelated to
  the plugin and not fixable from it.
- **External references stay.** A reference into `@metreeca/core` or `@metreeca/qest` carries an external URL and is
  left as it is, whether or not `externalSymbolLinkMappings` resolves it.
- **Type tests import the helpers.** Test-only imports do not affect the docs, but the helpers remain part of the
  module's export surface and of the published `.d.ts`; `stripInternal` MUST NOT be enabled in `tsconfig.json`, as it
  would strip them from the declarations and break `Instance` for every consumer.
