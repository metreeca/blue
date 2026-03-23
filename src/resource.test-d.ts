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
import type { Resource } from "@metreeca/qest/state";
import { describe, expectTypeOf, test } from "vitest";
import { optional, type ValuesShape, required, union, validate } from "./index.js";
import type { NumberShape } from "./number.js";
import { type Composition, type Content, property, resource } from "./resource.js";
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
		type Props = { name: { readonly kind: "property"; readonly range: ValuesShape<string, 1, 1> } };
		expectTypeOf<Composition<Props>>().toExtend<Resource>();
	});

	test("single required property → { key: V }", () => {
		type Props = { name: { readonly kind: "property"; readonly range: ValuesShape<string, 1, 1> } };
		expectTypeOf<Composition<Props>>().toHaveProperty("name").toEqualTypeOf<string>();
	});

	test("optional property → { key: undefined | V }", () => {
		type Props = { name: { readonly kind: "property"; readonly range: ValuesShape<string, undefined, 1> } };
		expectTypeOf<Composition<Props>>().toHaveProperty("name").toEqualTypeOf<undefined | string>();
	});

	test("multiple properties", () => {
		type Props = {
			name: { readonly kind: "property"; readonly range: ValuesShape<string, 1, 1> };
			age: { readonly kind: "property"; readonly range: ValuesShape<number, undefined, 1> };
		};
		expectTypeOf<Composition<Props>>().toHaveProperty("name").toEqualTypeOf<string>();
		expectTypeOf<Composition<Props>>().toHaveProperty("age").toEqualTypeOf<undefined | number>();
	});

	describe("naked entries", () => {

		test("single naked range → { key: V }", () => {
			type Props = { name: ValuesShape<string, 1, 1> };
			expectTypeOf<Composition<Props>>().toHaveProperty("name").toEqualTypeOf<string>();
		});

		test("naked optional range → { key: undefined | V }", () => {
			type Props = { name: ValuesShape<string, undefined, 1> };
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
				name: { readonly kind: "property"; readonly range: ValuesShape<string, 1, 1> };
				age: ValuesShape<number, undefined, 1>;
			};
			expectTypeOf<Composition<Props>>().toHaveProperty("name").toEqualTypeOf<string>();
			expectTypeOf<Composition<Props>>().toHaveProperty("age").toEqualTypeOf<undefined | number>();
		});

	});

});


describe("Content", () => {

	test("naked Range → V", () => {
		type E = ValuesShape<string, 1, 1>;
		expectTypeOf<Content<E>>().toEqualTypeOf<string>();
	});

	test("naked optional Range → undefined | V", () => {
		type E = ValuesShape<string, undefined, 1>;
		expectTypeOf<Content<E>>().toEqualTypeOf<undefined | string>();
	});

	test("Property with Range range → V", () => {
		type E = { readonly kind: "property"; readonly range: ValuesShape<string, 1, 1> };
		expectTypeOf<Content<E>>().toEqualTypeOf<string>();
	});

	test("Property with optional Range range → undefined | V", () => {
		type E = { readonly kind: "property"; readonly range: ValuesShape<string, undefined, 1> };
		expectTypeOf<Content<E>>().toEqualTypeOf<undefined | string>();
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
