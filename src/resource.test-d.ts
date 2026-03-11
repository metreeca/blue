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
 * Static type tests for resource shape type inference.
 *
 * Verifies compile-time type inference for resource shapes, including cardinality constraints, property composition,
 * and inheritance hierarchies. Uses Vitest type testing with `expectTypeOf` and `assertType`.
 *
 * @module
 */

import type { IRI } from "@metreeca/core/resource";
import type { Local, Locals, Resource } from "@metreeca/qest/state";
import { assertType, describe, expectTypeOf, test } from "vitest";
import type { BooleanShape } from "./boolean.js";
import type { ValueShape } from "./index.js";
import { validate } from "./index.js";
import type { LocalShape, LocalsShape } from "./local.js";
import { local, locals } from "./local.js";
import type { NumberShape } from "./number.js";
import {
	type Cardinality,
	type Composition,
	type Content,
	type Infer,
	multiple,
	optional,
	property,
	type Range,
	reference,
	type ReferenceShape,
	repeatable,
	required,
	resource,
	type ResourceShape,
	union
} from "./resource.js";
import type { StringShape } from "./string.js";


// helper shapes for tests

function string(): StringShape {
	return { kind: "string", model: "" };
}

function integer(): NumberShape {
	return { kind: "number", model: 0 };
}


describe("Overrides", () => {

	function Base() {
		return resource({
			name: property(required(string()))
		});
	}

	test("rejects incompatible override type", () => {
		// @ts-expect-error - incompatible override: integer does not extend string
		resource({ extends: Base }, { name: required(integer()) });
	});

	test("accepts compatible narrowing", () => {
		resource({ extends: Base }, { name: required(string()) });
	});

	test("rejects widening cardinality (required → optional)", () => {
		// @ts-expect-error - incompatible override: optional widens required
		resource({ extends: Base }, { name: optional(string()) });
	});

	test("rejects changing to array cardinality", () => {
		// @ts-expect-error - incompatible override: multiple changes scalar to array
		resource({ extends: Base }, { name: multiple(string()) });
	});

});

describe("Composition", () => {

	test("extends Resource", () => {
		type Props = { name: { readonly kind: "property"; readonly range: Range<string, 1, 1> } };
		expectTypeOf<Composition<Props>>().toExtend<Resource>();
	});

	test("single required property → { key: V }", () => {
		type Props = { name: { readonly kind: "property"; readonly range: Range<string, 1, 1> } };
		expectTypeOf<Composition<Props>>().toHaveProperty("name").toEqualTypeOf<string>();
	});

	test("optional property → { key: undefined | V }", () => {
		type Props = { name: { readonly kind: "property"; readonly range: Range<string, undefined, 1> } };
		expectTypeOf<Composition<Props>>().toHaveProperty("name").toEqualTypeOf<undefined | string>();
	});

	test("multiple properties", () => {
		type Props = {
			name: { readonly kind: "property"; readonly range: Range<string, 1, 1> };
			age: { readonly kind: "property"; readonly range: Range<number, undefined, 1> };
		};
		expectTypeOf<Composition<Props>>().toHaveProperty("name").toEqualTypeOf<string>();
		expectTypeOf<Composition<Props>>().toHaveProperty("age").toEqualTypeOf<undefined | number>();
	});

	describe("naked entries", () => {

		test("single naked range → { key: V }", () => {
			type Props = { name: Range<string, 1, 1> };
			expectTypeOf<Composition<Props>>().toHaveProperty("name").toEqualTypeOf<string>();
		});

		test("naked optional range → { key: undefined | V }", () => {
			type Props = { name: Range<string, undefined, 1> };
			expectTypeOf<Composition<Props>>().toHaveProperty("name").toEqualTypeOf<undefined | string>();
		});

		test("naked range with union shape via factory", () => {
			const r = required(union({ string: string(), number: integer() }));
			type Props = { value: typeof r };
			expectTypeOf<Composition<Props>>().toHaveProperty("value").toEqualTypeOf<{
				readonly string?: string;
				readonly number?: number;
			}>();
		});

		test("mixed Property and naked range", () => {
			type Props = {
				name: { readonly kind: "property"; readonly range: Range<string, 1, 1> };
				age: Range<number, undefined, 1>;
			};
			expectTypeOf<Composition<Props>>().toHaveProperty("name").toEqualTypeOf<string>();
			expectTypeOf<Composition<Props>>().toHaveProperty("age").toEqualTypeOf<undefined | number>();
		});

	});

});

describe("Cardinality", () => {

	test("required (1,1) → V", () => {
		expectTypeOf<Cardinality<string, 1, 1>>().toEqualTypeOf<string>();
	});

	test("optional (undefined,1) → undefined | V", () => {
		expectTypeOf<Cardinality<string, undefined, 1>>().toEqualTypeOf<undefined | string>();
	});

	test("multiple (undefined,undefined) → undefined | readonly V[]", () => {
		expectTypeOf<Cardinality<string, undefined, undefined>>().toEqualTypeOf<undefined | readonly string[]>();
	});

	test("repeatable (1,undefined) → readonly [V, ...V[]]", () => {
		expectTypeOf<Cardinality<string, 1, undefined>>().toEqualTypeOf<readonly [string, ...string[]]>();
	});

});

describe("Content", () => {

	test("naked Range → V", () => {
		type E = Range<string, 1, 1>;
		expectTypeOf<Content<E>>().toEqualTypeOf<string>();
	});

	test("naked optional Range → undefined | V", () => {
		type E = Range<string, undefined, 1>;
		expectTypeOf<Content<E>>().toEqualTypeOf<undefined | string>();
	});

	test("Property with Range range → V", () => {
		type E = { readonly kind: "property"; readonly range: Range<string, 1, 1> };
		expectTypeOf<Content<E>>().toEqualTypeOf<string>();
	});

	test("Property with optional Range range → undefined | V", () => {
		type E = { readonly kind: "property"; readonly range: Range<string, undefined, 1> };
		expectTypeOf<Content<E>>().toEqualTypeOf<undefined | string>();
	});

});

describe("Infer", () => {

	describe("value shapes", () => {

		test("BooleanShape → boolean", () => {
			expectTypeOf<Infer<BooleanShape>>().toEqualTypeOf<boolean>();
		});

		test("NumberShape → number", () => {
			expectTypeOf<Infer<NumberShape>>().toEqualTypeOf<number>();
		});

		test("StringShape → string", () => {
			expectTypeOf<Infer<StringShape>>().toEqualTypeOf<string>();
		});

		test("LocalShape → Local", () => {
			expectTypeOf<Infer<LocalShape>>().toEqualTypeOf<Local>();
		});

		test("LocalShape accepts string shorthand", () => {
			expectTypeOf<string>().toExtend<Infer<LocalShape>>();
		});

		test("LocalsShape → Locals", () => {
			expectTypeOf<Infer<LocalsShape>>().toEqualTypeOf<Locals>();
		});

		test("LocalsShape accepts string array shorthand", () => {
			expectTypeOf<readonly string[]>().toExtend<Infer<LocalsShape>>();
		});

		test("ReferenceShape → Reference", () => {
			expectTypeOf<Infer<ReferenceShape>>().toEqualTypeOf<IRI>();
		});

		test("ResourceShape → Resource", () => {
			expectTypeOf<Infer<ResourceShape>>().toEqualTypeOf<Resource>();
		});

		test("ValueShape → union of all model types", () => {
			expectTypeOf<Infer<ValueShape>>()
				.toEqualTypeOf<boolean | number | string | Local | Locals | IRI | Resource>();
		});

		test("lazy resource factory → unwrapped model type", () => {
			expectTypeOf<Infer<() => ResourceShape>>().toEqualTypeOf<Resource>();
		});

	});

	describe("cardinality", () => {

		function Shape() {
			return resource({
				req: property(required(string())),
				opt: property(optional(string())),
				mult: property(multiple(string())),
				rep: property(repeatable(string()))
			});
		}

		test("required → T", () => {
			expectTypeOf<Infer<typeof Shape>>().toHaveProperty("req").toEqualTypeOf<string>();
		});

		test("optional → undefined | T", () => {
			expectTypeOf<Infer<typeof Shape>>().toHaveProperty("opt").toEqualTypeOf<string | undefined>();
		});

		test("multiple → undefined | readonly T[]", () => {
			expectTypeOf<Infer<typeof Shape>>().toHaveProperty("mult").toEqualTypeOf<readonly string[] | undefined>();
		});

		test("repeatable → readonly [T, ...T[]]", () => {
			expectTypeOf<Infer<typeof Shape>>().toHaveProperty("rep").toEqualTypeOf<readonly [string, ...string[]]>();
		});

		test("rejects undefined for required", () => {
			// @ts-expect-error - required cannot be undefined
			assertType<Infer<typeof Shape>>({ req: undefined, rep: ["x"] });
		});

		test("rejects empty array for repeatable", () => {
			// @ts-expect-error - repeatable cannot be empty
			assertType<Infer<typeof Shape>>({ req: "x", rep: [] });
		});

	});

	describe("naked ranges", () => {

		function NakedShape() {
			return resource({
				req: required(string()),
				opt: optional(string()),
				mult: multiple(string()),
				rep: repeatable(string())
			});
		}

		test("required → T", () => {
			expectTypeOf<Infer<typeof NakedShape>>().toHaveProperty("req").toEqualTypeOf<string>();
		});

		test("optional → undefined | T", () => {
			expectTypeOf<Infer<typeof NakedShape>>().toHaveProperty("opt").toEqualTypeOf<string | undefined>();
		});

		test("multiple → undefined | readonly T[]", () => {
			expectTypeOf<Infer<typeof NakedShape>>().toHaveProperty("mult").toEqualTypeOf<readonly string[] | undefined>();
		});

		test("repeatable → readonly [T, ...T[]]", () => {
			expectTypeOf<Infer<typeof NakedShape>>().toHaveProperty("rep").toEqualTypeOf<readonly [string, ...string[]]>();
		});

		test("union accepts string variant", () => {
			function UnionShape() {
				return resource({
					value: optional(union({ string: string(), number: integer() }))
				});
			}

			assertType<Infer<typeof UnionShape>>({ value: { string: "text" } });
		});

		test("union accepts number variant", () => {
			function UnionShape() {
				return resource({
					value: optional(union({ string: string(), number: integer() }))
				});
			}

			assertType<Infer<typeof UnionShape>>({ value: { number: 42 } });
		});

		test("union rejects invalid type", () => {
			function UnionShape() {
				return resource({
					value: optional(union({ string: string(), number: integer() }))
				});
			}

			// @ts-expect-error - boolean not a valid variant value
			assertType<Infer<typeof UnionShape>>({ value: { string: true } });
		});

		test("mixed property and naked range", () => {
			function MixedShape() {
				return resource({
					name: property(required(string())),
					age: optional(integer())
				});
			}

			expectTypeOf<Infer<typeof MixedShape>>().toHaveProperty("name").toEqualTypeOf<string>();
			expectTypeOf<Infer<typeof MixedShape>>().toHaveProperty("age").toEqualTypeOf<number | undefined>();
		});

		test("rejects undefined for required", () => {
			function NakedRequired() {
				return resource({
					req: required(string()),
					rep: repeatable(string())
				});
			}

			// @ts-expect-error - required cannot be undefined
			assertType<Infer<typeof NakedRequired>>({ req: undefined, rep: ["x"] });
		});

	});

	describe("locals", () => {

		const Shape = resource({
			title: required(local()),
			keywords: optional(locals())
		});

		test("infers Local type", () => {
			expectTypeOf<Infer<typeof Shape>>().toHaveProperty("title").toEqualTypeOf<Local>();
		});

		test("infers Locals | undefined type", () => {
			expectTypeOf<Infer<typeof Shape>>().toHaveProperty("keywords").toEqualTypeOf<Locals | undefined>();
		});

		test("local accepts string shorthand", () => {
			expectTypeOf<string>().toExtend<Infer<typeof Shape>["title"]>();
		});

		test("locals accepts string array shorthand", () => {
			expectTypeOf<readonly string[]>().toExtend<NonNullable<Infer<typeof Shape>["keywords"]>>();
		});

		test("accepts tagged object for local", () => {
			assertType<Infer<typeof Shape>>({ title: { en: "Hello" } });
		});

		test("accepts string shorthand for local", () => {
			assertType<Infer<typeof Shape>>({ title: "Hello" });
		});

		test("accepts tagged object for locals", () => {
			assertType<Infer<typeof Shape>>({ title: "Hello", keywords: { en: ["a", "b"] } });
		});

		test("accepts string array shorthand for locals", () => {
			assertType<Infer<typeof Shape>>({ title: "Hello", keywords: ["a", "b"] });
		});

		test("rejects number for local", () => {
			// @ts-expect-error - number not assignable to Local
			assertType<Infer<typeof Shape>>({ title: 42 });
		});

		test("rejects number array for locals", () => {
			// @ts-expect-error - number[] not assignable to Locals
			assertType<Infer<typeof Shape>>({ title: "Hello", keywords: [1, 2] });
		});

	});

	describe("unions", () => {

		function Shape() {
			return resource({
				value: property(required(union({ string: string(), number: integer() })))
			});
		}

		test("accepts string variant", () => {
			assertType<Infer<typeof Shape>>({ value: { string: "text" } });
		});

		test("accepts number variant", () => {
			assertType<Infer<typeof Shape>>({ value: { number: 42 } });
		});

		test("rejects invalid type", () => {
			// @ts-expect-error - boolean not a valid variant value
			assertType<Infer<typeof Shape>>({ value: { string: true } });
		});

		test("rejects bare value without variant key", () => {
			// @ts-expect-error - union values must be indexed by variant identifier
			assertType<Infer<typeof Shape>>({ value: "text" });
		});

		test("rejects unknown variant identifier", () => {
			// @ts-expect-error - 'unknown' is not a declared variant
			assertType<Infer<typeof Shape>>({ value: { unknown: "text" } });
		});

	});

	describe("inheritance", () => {

		describe("single", () => {

			function Base() {
				return resource({
					name: property(required(string()))
				});
			}

			function Derived() {
				return resource({ extends: Base }, {
					code: property(required(string()))
				});
			}

			test("includes inherited properties", () => {
				expectTypeOf<Infer<typeof Derived>>().toHaveProperty("name").toEqualTypeOf<string>();
				expectTypeOf<Infer<typeof Derived>>().toHaveProperty("code").toEqualTypeOf<string>();
			});

			test("rejects missing inherited property", () => {
				// @ts-expect-error - missing inherited 'name'
				assertType<Infer<typeof Derived>>({ code: "own" });
			});

		});

		describe("multiple", () => {

			function Base() {
				return resource({
					name: property(required(string()))
				});
			}

			function Mixin() {
				return resource({
					label: property(optional(string()))
				});
			}

			function Multi() {
				return resource({ extends: [Base, Mixin] }, {
					id: property(required(string()))
				});
			}

			test("includes properties from all parents", () => {
				expectTypeOf<Infer<typeof Multi>>().toHaveProperty("name").toEqualTypeOf<string>();
				expectTypeOf<Infer<typeof Multi>>().toHaveProperty("label").toEqualTypeOf<string | undefined>();
				expectTypeOf<Infer<typeof Multi>>().toHaveProperty("id").toEqualTypeOf<string>();
			});

			test("rejects missing property from parent", () => {
				// @ts-expect-error - missing 'name' from Base
				assertType<Infer<typeof Multi>>({ label: "mixin", id: "own" });
			});

		});

		describe("deep", () => {

			function GrandParent() {
				return resource({
					a: property(required(string()))
				});
			}

			function Parent() {
				return resource({ extends: GrandParent }, {
					b: property(required(string()))
				});
			}

			function Child() {
				return resource({ extends: Parent }, {
					c: property(required(string()))
				});
			}

			test("includes properties from all ancestors", () => {
				expectTypeOf<Infer<typeof Child>>().toHaveProperty("a").toEqualTypeOf<string>();
				expectTypeOf<Infer<typeof Child>>().toHaveProperty("b").toEqualTypeOf<string>();
				expectTypeOf<Infer<typeof Child>>().toHaveProperty("c").toEqualTypeOf<string>();
			});

			test("rejects missing grandparent property", () => {
				// @ts-expect-error - missing 'a' from GrandParent
				assertType<Infer<typeof Child>>({ b: "parent", c: "child" });
			});

		});

		describe("diamond", () => {

			function Root() {
				return resource({
					id: property(required(string()))
				});
			}

			function Left() {
				return resource({ extends: Root }, {
					left: property(required(string()))
				});
			}

			function Right() {
				return resource({ extends: Root }, {
					right: property(required(string()))
				});
			}

			function Diamond() {
				return resource({ extends: [Left, Right] }, {
					own: property(required(string()))
				});
			}

			test("includes properties from all paths", () => {
				expectTypeOf<Infer<typeof Diamond>>().toHaveProperty("id").toEqualTypeOf<string>();
				expectTypeOf<Infer<typeof Diamond>>().toHaveProperty("left").toEqualTypeOf<string>();
				expectTypeOf<Infer<typeof Diamond>>().toHaveProperty("right").toEqualTypeOf<string>();
				expectTypeOf<Infer<typeof Diamond>>().toHaveProperty("own").toEqualTypeOf<string>();
			});

		});

		describe("mixed optionality", () => {

			function Base() {
				return resource({
					reqBase: property(required(string())),
					optBase: property(optional(string()))
				});
			}

			function Derived() {
				return resource({ extends: Base }, {
					reqOwn: property(required(integer())),
					optOwn: property(optional(integer()))
				});
			}

			test("preserves optionality from parent", () => {
				expectTypeOf<Infer<typeof Derived>>().toHaveProperty("reqBase").toEqualTypeOf<string>();
				expectTypeOf<Infer<typeof Derived>>().toHaveProperty("optBase").toEqualTypeOf<string | undefined>();
				expectTypeOf<Infer<typeof Derived>>().toHaveProperty("reqOwn").toEqualTypeOf<number>();
				expectTypeOf<Infer<typeof Derived>>().toHaveProperty("optOwn").toEqualTypeOf<number | undefined>();
			});

			test("allows omitting optional properties", () => {
				assertType<Infer<typeof Derived>>({ reqBase: "x", reqOwn: 1 });
			});

		});

	});

	describe("laziness", () => {

		test("direct shape", () => {

			const DirectShape = resource({
				name: property(required(string()))
			});

			expectTypeOf<Infer<typeof DirectShape>>().toHaveProperty("name").toEqualTypeOf<string>();

		});

		test("lazy factory", () => {

			function LazyShape() {
				return resource({
					name: property(required(string()))
				});
			}

			expectTypeOf<Infer<typeof LazyShape>>().toHaveProperty("name").toEqualTypeOf<string>();

		});

	});

	describe("references", () => {

		function TreeNode() {
			return resource({
				label: property(required(string())),
				children: property(multiple(reference(TreeNode)))
			});
		}

		test("infers as IRI", () => {
			expectTypeOf<Infer<typeof TreeNode>>().toHaveProperty("children").toEqualTypeOf<undefined | readonly IRI[]>();
		});

		test("accepts IRI array", () => {
			assertType<Infer<typeof TreeNode>>({ label: "root", children: ["/child1" as IRI, "/child2" as IRI] });
		});

		test("accepts undefined", () => {
			assertType<Infer<typeof TreeNode>>({ label: "leaf" });
		});

		test("rejects non-IRI values", () => {
			// @ts-expect-error - number not assignable to IRI
			assertType<Infer<typeof TreeNode>>({ label: "root", children: [1, 2] });
		});

	});

	describe("composition", () => {

		test("maps identifier keys to their content types", () => {

			const shape = resource({
				name: required(string()),
				age: optional(integer())
			});

			expectTypeOf<Infer<typeof shape>>().toHaveProperty("name").toEqualTypeOf<string>();
			expectTypeOf<Infer<typeof shape>>().toHaveProperty("age").toEqualTypeOf<number | undefined>();

		});

		test("accepts extra properties via Resource index signature", () => {

			const shape = resource({
				name: required(string())
			});

			assertType<Infer<typeof shape>>({ name: "test", extra: "unexpected" });

		});

	});

	describe("type validation", () => {

		const Shape = resource({
			name: property(required(string())),
			age: property(optional(integer())),
			tags: property(multiple(string())),
			roles: property(repeatable(string()))
		});

		describe("required property", () => {

			test("accepts correct type", () => {
				assertType<Infer<typeof Shape>>({ name: "Alice", roles: ["admin"] });
			});

			test("rejects wrong type", () => {
				// @ts-expect-error - number not assignable to string
				assertType<Infer<typeof Shape>>({ name: 123, roles: ["admin"] });
			});

			test("rejects undefined", () => {
				// @ts-expect-error - required cannot be undefined
				assertType<Infer<typeof Shape>>({ name: undefined, roles: ["admin"] });
			});

			test("rejects missing property", () => {
				// @ts-expect-error - missing required 'name'
				assertType<Infer<typeof Shape>>({ roles: ["admin"] });
			});

		});

		describe("optional property", () => {

			test("accepts correct type", () => {
				assertType<Infer<typeof Shape>>({ name: "Alice", age: 30, roles: ["admin"] });
			});

			test("accepts omitted", () => {
				assertType<Infer<typeof Shape>>({ name: "Alice", roles: ["admin"] });
			});

			test("rejects wrong type", () => {
				// @ts-expect-error - string not assignable to number
				assertType<Infer<typeof Shape>>({ name: "Alice", age: "thirty", roles: ["admin"] });
			});

		});

		describe("multiple property", () => {

			test("accepts array", () => {
				assertType<Infer<typeof Shape>>({ name: "Alice", tags: ["a", "b"], roles: ["admin"] });
			});

			test("accepts omitted", () => {
				assertType<Infer<typeof Shape>>({ name: "Alice", roles: ["admin"] });
			});

			test("rejects scalar", () => {
				// @ts-expect-error - scalar not assignable to array
				assertType<Infer<typeof Shape>>({ name: "Alice", tags: "single", roles: ["admin"] });
			});

			test("rejects wrong element type", () => {
				// @ts-expect-error - number[] not assignable to string[]
				assertType<Infer<typeof Shape>>({ name: "Alice", tags: [1, 2, 3], roles: ["admin"] });
			});

		});

		describe("repeatable property", () => {

			test("accepts non-empty array", () => {
				assertType<Infer<typeof Shape>>({ name: "Alice", roles: ["admin", "user"] });
			});

			test("accepts single element", () => {
				assertType<Infer<typeof Shape>>({ name: "Alice", roles: ["admin"] });
			});

			test("rejects empty array", () => {
				// @ts-expect-error - empty array not assignable to non-empty tuple
				assertType<Infer<typeof Shape>>({ name: "Alice", roles: [] });
			});

			test("rejects undefined", () => {
				// @ts-expect-error - undefined not assignable to non-empty tuple
				assertType<Infer<typeof Shape>>({ name: "Alice", roles: undefined });
			});

			test("rejects scalar", () => {
				// @ts-expect-error - scalar not assignable to array
				assertType<Infer<typeof Shape>>({ name: "Alice", roles: "admin" });
			});

		});

	});

});


describe("resource()", () => {

	test("validate() accepts concrete shapes", () => {

		const shape = resource({
			name: property(required(string()))
		});

		validate({}, { scope: "value", shape });

	});

	test("extends accepts concrete parent", () => {

		function Base() {
			return resource({
				name: property(required(string()))
			});
		}

		resource({ extends: Base }, {
			code: property(required(string()))
		});

	});

	test("extends accepts multiple concrete parents", () => {

		function Parent1() {
			return resource({ label: required(string()) });
		}

		function Parent2() {
			return resource({ code: required(string()) });
		}

		resource({ extends: [Parent1, Parent2] }, {
			extra: required(string())
		});

	});

	test("extends accepts single lazy shape", () => {

		function Parent() {
			return resource({ name: required(string()) });
		}

		resource({ extends: Parent }, { extra: required(string()) });

	});

	test("extends accepts non-empty array of lazy shapes", () => {

		function Parent1() {
			return resource({ name: required(string()) });
		}

		function Parent2() {
			return resource({ code: required(string()) });
		}

		resource({ extends: [Parent1, Parent2] }, { extra: required(string()) });

	});

	test("extends rejects empty array", () => {
		// @ts-expect-error - empty array not assignable to non-empty tuple
		resource({ extends: [] }, { name: required(string()) });
	});

	test("accepts non-empty classes array", () => {
		resource({ classes: ["https://example.org/Type" as IRI] }, {});
	});

	test("accepts non-empty in array", () => {
		resource({ in: ["https://example.org/a" as IRI, "https://example.org/b" as IRI] }, {});
	});

	test("accepts non-empty hasValue array", () => {
		resource({ hasValue: ["https://example.org/x" as IRI] }, {});
	});

	test("rejects empty classes array", () => {
		// @ts-expect-error - empty array not assignable to non-empty tuple
		resource({ classes: [] }, {});
	});

	test("rejects empty in array", () => {
		// @ts-expect-error - empty array not assignable to non-empty tuple
		resource({ in: [] }, {});
	});

	test("rejects empty hasValue array", () => {
		// @ts-expect-error - empty array not assignable to non-empty tuple
		resource({ hasValue: [] }, {});
	});

	test("child accepts optional properties with inherited parent", () => {

		function Parent() {
			return resource({ name: required(string()) });
		}

		resource({ extends: Parent }, {
			extra: optional(string())
		});

	});

});
