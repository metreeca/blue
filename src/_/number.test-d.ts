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
import { type Instance, type Proposal } from "./index.js";
import { byte, decimal, double, float, int, integer, long, type NumberShape, number, short } from "./number.js";
import { multiple, optional, required, resource } from "./resource.js";


describe("number", () => {

	test("number → NumberShape", () => {
		expectTypeOf(number()).toEqualTypeOf<NumberShape>();
	});

	test("byte → NumberShape", () => {
		expectTypeOf(byte()).toEqualTypeOf<NumberShape>();
	});

	test("short → NumberShape", () => {
		expectTypeOf(short()).toEqualTypeOf<NumberShape>();
	});

	test("int → NumberShape", () => {
		expectTypeOf(int()).toEqualTypeOf<NumberShape>();
	});

	test("long → NumberShape", () => {
		expectTypeOf(long()).toEqualTypeOf<NumberShape>();
	});

	test("float → NumberShape", () => {
		expectTypeOf(float()).toEqualTypeOf<NumberShape>();
	});

	test("double → NumberShape", () => {
		expectTypeOf(double()).toEqualTypeOf<NumberShape>();
	});

	test("integer → NumberShape", () => {
		expectTypeOf(integer()).toEqualTypeOf<NumberShape>();
	});

	test("decimal → NumberShape", () => {
		expectTypeOf(decimal()).toEqualTypeOf<NumberShape>();
	});

	test("NumberShape → number", () => {
		expectTypeOf<Instance<NumberShape>>().toEqualTypeOf<number>();
	});

	test("enumerated NumberShape → admitted values", () => {

		const shape=number({ in: [1, 2] });

		expectTypeOf<Instance<typeof shape>>().toEqualTypeOf<1 | 2>();

	});

	test("enumerated shorthand → admitted values", () => {

		const shape=byte({ in: [1, 2] });

		expectTypeOf<Instance<typeof shape>>().toEqualTypeOf<1 | 2>();

	});

	test("open NumberShape → number", () => {

		const shape=number({ minInclusive: 0 });

		expectTypeOf<Instance<typeof shape>>().toEqualTypeOf<number>();

	});

	test("empty enumeration → number", () => {

		const shape=number({ in: [] });

		expectTypeOf<Instance<typeof shape>>().toEqualTypeOf<number>();

	});

	test("unenumerated values → number", () => {

		const values: readonly number[]=[1, 2];
		const shape=number({ in: values });

		expectTypeOf<Instance<typeof shape>>().toEqualTypeOf<number>();

	});

	test("stated values → admitted values", () => {

		const values: readonly (1 | 2)[]=[1, 2];
		const shape=number({ in: values });

		expectTypeOf<Instance<typeof shape>>().toEqualTypeOf<1 | 2>();

	});

	test("enumerated shape → open constraints", () => {

		const shape=number({ in: [1, 2], minInclusive: 0 });

		expectTypeOf(shape.minInclusive).toEqualTypeOf<undefined | number>();

	});

	test("refuses a narrowing claim outside the constraints", () => {

		// @ts-expect-error - the state is stated through the constraints, not on its own
		const shape=number<1 | 2>();

		expectTypeOf<Instance<typeof shape>>().toEqualTypeOf<number>();

	});

	test("refuses values the enumeration omits", () => {

		// @ts-expect-error - the stated enumeration doesn't admit the supplied values
		const shape=number<{ readonly in: readonly [1, 2] }>({ in: [1] });

		expectTypeOf<Instance<typeof shape>>().toEqualTypeOf<1 | 2>();

	});

});

describe("members", () => {

	const Product=resource({
		code: required(integer()),
		rating: optional(integer({ in: [1, 2, 3] })),
		scores: multiple(number({ in: [1, 2] })),
		price: optional(number({ minInclusive: 0 }))
	});

	test("carries the admitted values through cardinality", () => {

		expectTypeOf<Instance<typeof Product>["code"]>().toEqualTypeOf<number>();
		expectTypeOf<Instance<typeof Product>["rating"]>().toEqualTypeOf<undefined | 1 | 2 | 3>();
		expectTypeOf<Instance<typeof Product>["scores"]>().toEqualTypeOf<undefined | readonly (1 | 2)[]>();
		expectTypeOf<Instance<typeof Product>["price"]>().toEqualTypeOf<undefined | number>();

	});

	test("carries the admitted values into a submission", () => {
		expectTypeOf<Proposal<typeof Product>["rating"]>().toEqualTypeOf<undefined | 1 | 2 | 3>();
	});

	test("carries the admitted values through inheritance", () => {

		const Rated=resource(Product, { rating: required(integer({ in: [1, 2] })) });

		expectTypeOf<Instance<typeof Rated>["rating"]>().toEqualTypeOf<1 | 2>();

	});

});
