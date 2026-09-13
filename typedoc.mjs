/*
 * Copyright © 2025-2026 Metreeca srl
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Keeps type inference machinery out of the generated API docs.
 *
 * The value a shape describes is resolved by a chain of helper types (`Retrieved`, `Submitted`, `Carried`, `Content`,
 * `Slot`, `Arity`, `Legal`, `Declared`, `Branch`, `Plain`, …) exported from the per-kind `inference.ts` modules so that
 * the public aliases and the type tests can reach them. None of those modules is an entry point, so a consumer reading
 * `Instance`, `Compound`, `property()` or a scalar factory learns nothing from a signature naming one: TypeDoc renders
 * it as unlinked dead text. Two guarantees put an annotation there instead:
 *
 * - a type alias tagged `@opaque` renders as `{ inferred from <S> }`, its comment carrying the resolved value in full;
 * - a reference to a project symbol the docs leave out renders as `{ inferred from <C> }` where it is the sole type
 *   argument, as `{ inferred L }` where it fills a named slot beside siblings, as in
 *   `Range<R, { inferred L }, { inferred U }>`, and as a bare `{ inferred }` where the container offers no slot to name
 *   it by.
 *
 * The second guarantee doubles as a safety net: a helper leaking into a future signature is annotated with no per-site
 * tagging. Neither hides anything from TypeScript, which resolves and displays the machinery as before.
 *
 * TypeDoc offers no built-in switch. `@internal`, `@hidden` and `@ignore` drop a helper but leave its name dangling in
 * every signature referencing it, while `@inline` and `@expand` paste the machinery in place; requests for one
 * ([#2032](https://github.com/TypeStrong/typedoc/issues/2032),
 * [#2273](https://github.com/TypeStrong/typedoc/issues/2273)) closed without.
 *
 * Verified against TypeDoc 0.28.14. What the implementation relies on:
 *
 * - the file MUST live inside the project, so that it resolves the `typedoc` package;
 * - `@opaque` is appended to `modifierTags` on bootstrap, as setting that option in `typedoc.json` would drop the
 *   defaults, leaving `@internal` an unknown tag and `excludeInternal` silently ineffective;
 * - the modifier is removed once consumed, as TypeDoc otherwise renders it as a tag badge on the alias heading;
 * - an annotation replaces the reference node rather than renaming it, which removes it ahead of the `notExported`
 *   validation and so spares `typedoc.json` an `intentionallyNotExported` entry per helper; the trade-off is that a
 *   newly leaked helper is annotated silently rather than warned about;
 * - the annotation is an `IntrinsicType`, as an `UnknownType` parenthesises itself everywhere but the root;
 * - iterating `project.reflections` reaches every rendered type, signatures, parameters and type parameters being
 *   reflections in their own right.
 *
 * Two leaks stay out of reach. TypeScript flattens an intersection alias such as `Property` before TypeDoc sees it, so
 * `property()` publishes the expansion rather than the alias name. A reference into another package carries an external
 * URL and is left alone, so it renders as a link only where `externalSymbolLinkMappings` resolves it and as dead text
 * otherwise.
 */

import { Application, Converter, IntrinsicType, makeRecursiveVisitor, ReflectionKind } from "typedoc";

const OPAQUE = "@opaque";

const inferred = hint => `{ inferred${ hint ? ` ${ hint }` : "" } }`; // brace-wrapped, reading as an annotation

const from = names => names.length ? `from <${ [...new Set(names)].join(", ") }>` : "";

const parameters = type => (type.typeArguments ?? []).flatMap(argument => argument.type !== "reference" ? []
	: argument.reflection?.kind === ReflectionKind.TypeParameter ? [argument.name]
		: parameters(argument)
);


export function load(app) {

	app.on(Application.EVENT_BOOTSTRAP_END, () => { // extend the defaults: replacing them would unregister @internal
		app.options.setValue("modifierTags", [...app.options.getValue("modifierTags"), OPAQUE]);
	});

	app.converter.on(Converter.EVENT_RESOLVE_BEGIN, ({ project }) => {
		project.getReflectionsByKind(ReflectionKind.TypeAlias)
			.filter(reflection => reflection.comment?.hasModifier(OPAQUE))
			.forEach(reflection => {
				reflection.type = new IntrinsicType(inferred(from((reflection.typeParameters ?? []).map(({ name }) => name))));
				reflection.comment.removeModifier(OPAQUE); // otherwise rendered as a tag badge on the alias heading
			});
	});

	app.converter.on(Converter.EVENT_RESOLVE_END, ({ project }) => {

		const hidden = type => type?.type === "reference" && !type.reflection && type.package === project.packageName;

		const annotation = type => new IntrinsicType(inferred(from(parameters(type))));

		const slot = (type, index) => new IntrinsicType(inferred(type.reflection?.typeParameters?.[index]?.name));

		const elide = makeRecursiveVisitor({ // a reference knows whether an elided argument stands alone

			reference: type => hidden(type)

				? Object.assign(type, { name: inferred(), typeArguments: undefined }) // no slot to name it by

				: Object.assign(type, {
					typeArguments: type.typeArguments?.map((argument, index) => !hidden(argument) ? argument
						: type.typeArguments.length > 1 ? slot(type, index) // named by the slot it fills
							: annotation(argument)
					)
				})

		});

		Object.values(project.reflections) // signatures, parameters and type parameters are reflections in turn
			.forEach(reflection => {
				reflection.type = hidden(reflection.type) ? annotation(reflection.type) : reflection.type;
				reflection.type?.visit(elide);
			});

	});

}
