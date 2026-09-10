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

import type { Lazy } from "@metreeca/core";
import { describe, expectTypeOf, test } from "vitest";
import { type Shape } from "./_.js";
import { type Count, type Omissible, type Range, type Repeated } from "./index.js";
import { type StringShape } from "./string.js";


describe("Range", () => {

	test("carries the shape its values are drawn from", () => {
		expectTypeOf<Range<StringShape, 1, 1>["range"]>().toEqualTypeOf<StringShape>();
	});

	test("carries a deferred shape as it stands", () => {
		expectTypeOf<Range<() => StringShape, 1, 1>["range"]>().toEqualTypeOf<() => StringShape>();
	});

	test("carries the bounds it is given", () => {
		expectTypeOf<Range<StringShape, 2, 5>["minCount"]>().toEqualTypeOf<2>();
		expectTypeOf<Range<StringShape, 2, 5>["maxCount"]>().toEqualTypeOf<5>();
	});

	test("carries an unstated bound as absent", () => {
		expectTypeOf<Range<StringShape, undefined, undefined>["minCount"]>().toEqualTypeOf<undefined>();
		expectTypeOf<Range<StringShape, undefined, undefined>["maxCount"]>().toEqualTypeOf<undefined>();
	});

	test("admits any shape at any cardinality where nothing is stated", () => {
		expectTypeOf<Range>().toEqualTypeOf<Range<Lazy<Shape>, Count, Count>>();
		expectTypeOf<Range<StringShape, 1, 1>>().toExtend<Range>();
	});

	test("admits a range assembled from a shape", () => {
		expectTypeOf<{ readonly range: StringShape, readonly minCount: 1, readonly maxCount: 1 }>().toExtend<Range>();
	});

});

describe("Repeated", () => {

	test("a bare value where exactly one is required", () => {
		expectTypeOf<Repeated<string, 1, 1>>().toEqualTypeOf<string>();
	});

	test("an optional value where at most one is admitted", () => {
		expectTypeOf<Repeated<string, undefined, 1>>().toEqualTypeOf<undefined | string>();
	});

	test("a non-empty array where at least one is required", () => {
		expectTypeOf<Repeated<string, 1, undefined>>().toEqualTypeOf<readonly [string, ...string[]]>();
	});

	test("an optional array where any number is admitted", () => {
		expectTypeOf<Repeated<string, undefined, undefined>>().toEqualTypeOf<undefined | readonly string[]>();
	});

	test("a non-empty array where the lower bound exceeds one", () => {
		expectTypeOf<Repeated<string, 2, 5>>().toEqualTypeOf<readonly [string, ...string[]]>();
	});

	test("an optional array where the lower bound is zero", () => {
		expectTypeOf<Repeated<string, 0, 5>>().toEqualTypeOf<undefined | readonly string[]>();
	});

	test("an optional array where the bounds are not literal", () => {
		expectTypeOf<Repeated<string, number, number>>().toEqualTypeOf<undefined | readonly string[]>();
	});

});

describe("Omissible", () => {

	test("a stated lower bound requires a value", () => {
		expectTypeOf<Omissible<1>>().toEqualTypeOf<false>();
		expectTypeOf<Omissible<2>>().toEqualTypeOf<false>();
	});

	test("an unstated or zero lower bound admits absence", () => {
		expectTypeOf<Omissible<undefined>>().toEqualTypeOf<true>();
		expectTypeOf<Omissible<0>>().toEqualTypeOf<true>();
	});

	test("a bound stated only as a number admits absence", () => {
		expectTypeOf<Omissible<number>>().toEqualTypeOf<true>();
	});

});

describe("Count", () => {

	test("admits a stated bound", () => {
		expectTypeOf<1>().toExtend<Count>();
	});

	test("admits an unstated bound", () => {
		expectTypeOf<undefined>().toExtend<Count>();
	});

});
