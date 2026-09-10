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

import { describe, expectTypeOf, test } from "vitest";
import {
	type Id,
	id,
	multiple,
	nonempty,
	optional,
	type Property,
	property,
	reference,
	type ReferenceShape,
	required,
	resource,
	type Type,
	type as typed
} from "./resource.js";
import { type StringShape, string } from "./string.js";


describe("resource factories", () => {

	test("id → Id", () => {
		expectTypeOf(id()).toEqualTypeOf<Id>();
	});

	test("type → Type", () => {
		expectTypeOf(typed()).toEqualTypeOf<Type>();
	});

	test("reference → a ReferenceShape carrying its target", () => {
		const target=resource({ id: id() });

		expectTypeOf(reference(target)).toEqualTypeOf<ReferenceShape<typeof target>>();
	});

	test("required → exactly one value", () => {
		expectTypeOf(required(string())).toEqualTypeOf<Property<StringShape, 1, 1>>();
	});

	test("optional → at most one value", () => {
		expectTypeOf(optional(string())).toEqualTypeOf<Property<StringShape, undefined, 1>>();
	});

	test("nonempty → at least one value", () => {
		expectTypeOf(nonempty(string())).toEqualTypeOf<Property<StringShape, 1, undefined>>();
	});

	test("multiple → any number of values", () => {
		expectTypeOf(multiple(string())).toEqualTypeOf<Property<StringShape, undefined, undefined>>();
	});

	test("the cardinality factories accept constraints", () => {
		expectTypeOf(required(string(), { hidden: true }))
			.toEqualTypeOf<{ readonly hidden: true } & Property<StringShape, 1, 1>>();
	});

	test("property → the bounds it was given", () => {
		expectTypeOf(property(string(), { minCount: 2, maxCount: 5 }))
			.toEqualTypeOf<{ readonly minCount: 2, readonly maxCount: 5 } & Property<StringShape, 2, 5>>();
	});

	test("property → unstated bounds where none are given", () => {
		expectTypeOf(property(string()))
			.toEqualTypeOf<Property<StringShape, undefined, undefined>>();
	});

	test("property → one bound where only one is given", () => {
		expectTypeOf(property(string(), { minCount: 1 }))
			.toEqualTypeOf<{ readonly minCount: 1 } & Property<StringShape, 1, undefined>>();
	});

	test("property → accepts constraints after the range", () => {
		expectTypeOf(property(string(), { hidden: true, forward: "https://example.org/label" }))
			.toEqualTypeOf<{ readonly hidden: true, readonly forward: "https://example.org/label" } & Property<StringShape, undefined, undefined>>();
	});

	test("property → rejects an unknown constraint", () => {
		// @ts-expect-error - nope is not a property constraint
		property(string(), { nope: true });
	});

	test("Property admits any shape as its range", () => {
		expectTypeOf<Property["range"]>().toEqualTypeOf<Parameters<typeof property>[0]>();
	});

});
