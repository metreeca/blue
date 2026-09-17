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
import { multiple, optional, required, resource } from "../resource/index.js";
import { string } from "../string/index.js";
import { union } from "../union/index.js";
import { type Instance } from "../value/index.js";
import { type BooleanShape, boolean } from "./index.js";


describe("boolean", () => {

	test("boolean → BooleanShape", () => {
		expectTypeOf(boolean()).toEqualTypeOf<BooleanShape>();
	});

	test("BooleanShape → boolean", () => {
		expectTypeOf<Instance<BooleanShape>>().toEqualTypeOf<boolean>();
	});

	test("enumerated BooleanShape → admitted value", () => {

		const shape=boolean({ in: true });

		expectTypeOf(shape).toEqualTypeOf<BooleanShape<true>>();
		expectTypeOf<Instance<typeof shape>>().toEqualTypeOf<true>();

	});

	test("enumerated shorthand → admitted value", () => {

		const shape=boolean(false);

		expectTypeOf(shape).toEqualTypeOf<BooleanShape<false>>();
		expectTypeOf<Instance<typeof shape>>().toEqualTypeOf<false>();

	});

	test("unenumerated shorthand → boolean", () => {

		const flag: () => boolean=() => true;
		const shape=boolean(flag());

		expectTypeOf<Instance<typeof shape>>().toEqualTypeOf<boolean>();

	});

	test("unenumerated value → boolean", () => {

		const flag: () => boolean=() => true;
		const shape=boolean({ in: flag() });

		expectTypeOf<Instance<typeof shape>>().toEqualTypeOf<boolean>();

	});

	test("refuses a narrowing claim outside the constraints", () => {

		// @ts-expect-error - the state is stated through the constraints, not on its own
		const shape=boolean<true>();

		expectTypeOf<Instance<typeof shape>>().toEqualTypeOf<boolean>();

	});

	test("refuses a value the enumeration omits", () => {

		// @ts-expect-error - the stated enumeration doesn't admit the supplied value
		const shape=boolean<{ readonly in: true }>({ in: false });

		expectTypeOf<Instance<typeof shape>>().toEqualTypeOf<true>();

	});

});

describe("members", () => {

	const Product=resource({
		available: required(boolean()),
		featured: optional(boolean({ in: true })),
		flags: multiple(boolean({ in: false }))
	});

	test("carries the admitted value through cardinality", () => {

		expectTypeOf<Instance<typeof Product>["available"]>().toEqualTypeOf<boolean>();
		expectTypeOf<Instance<typeof Product>["featured"]>().toEqualTypeOf<undefined | true>();
		expectTypeOf<Instance<typeof Product>["flags"]>().toEqualTypeOf<undefined | readonly false[]>();

	});

	test("carries the admitted value through inheritance", () => {

		const Featured=resource(Product, { available: required(boolean({ in: true })) });

		expectTypeOf<Instance<typeof Featured>["available"]>().toEqualTypeOf<true>();

	});

});

describe("tagged unions", () => {

	const Payment=union(
		resource({ settled: required(boolean({ in: false })), due: required(string()) }),
		resource({ settled: required(boolean({ in: true })), paid: required(string()) })
	);

	type Value=Instance<typeof Payment>

	test("tags each alternative with the value it admits", () => {

		expectTypeOf<Value["settled"]>().toEqualTypeOf<false | true>();

	});

	test("singles out an alternative by its tag", () => {

		expectTypeOf<Extract<Value, { settled: true }>>().toEqualTypeOf<{

			readonly settled: true,
			readonly paid: string

		}>();

	});

});
