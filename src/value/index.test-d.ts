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

import type { Tag } from "@metreeca/core/language";
import type { Reference, Resource } from "@metreeca/qest/state";
import { describe, expectTypeOf, test } from "vitest";
import { type BooleanShape } from "../boolean/index.js";
import { type DictionaryShape } from "../dictionary/index.js";
import { type ReferenceShape } from "../reference/index.js";
import { type Property, type ResourceShape } from "../resource/index.js";
import { type StringShape } from "../string/index.js";
import { type Instance, type Range } from "./index.js";


type LabelShape={

	readonly kind: "resource",
	readonly classes: readonly Reference[],
	readonly parents: [],

	readonly members: {
		readonly label: Property<StringShape, 1, 1>
	}

}

type LabelState={ readonly label: string }


type Singular={ readonly [tag: Tag]: string }

type Plural={ readonly [tag: Tag]: readonly string[] }


type UniqueShape=DictionaryShape & { readonly uniqueLang: true }


describe("Range", () => {

	test("carries the shape its values are drawn from", () => {
		expectTypeOf<Range<StringShape, 1, 1>["shape"]>().toEqualTypeOf<StringShape>();
	});

	test("carries a deferred shape as it stands", () => {
		expectTypeOf<Range<() => StringShape, 1, 1>["shape"]>().toEqualTypeOf<() => StringShape>();
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
		expectTypeOf<Range<StringShape, 1, 1>>().toExtend<Range>();
	});

	test("admits a range assembled from a shape", () => {
		expectTypeOf<{ readonly shape: StringShape, readonly minCount: 1, readonly maxCount: 1 }>().toExtend<Range>();
	});

});

describe("Instance", () => {

	describe("dictionary shapes", () => {

		test("DictionaryShape → a tag-keyed map of arrays", () => {
			expectTypeOf<Instance<DictionaryShape>>().toEqualTypeOf<Plural>();
		});

		test("unique-tagged DictionaryShape → a tag-keyed map of strings", () => {
			expectTypeOf<Instance<UniqueShape>>().toEqualTypeOf<Singular>();
		});

	});

	describe("reference shapes", () => {

		test("ReferenceShape → an IRI", () => {
			expectTypeOf<Instance<ReferenceShape>>().toEqualTypeOf<Reference>();
		});

	});

	describe("resource shapes", () => {

		test("ResourceShape → the instance its members describe", () => {
			expectTypeOf<Instance<LabelShape>>().toEqualTypeOf<LabelState>();
		});

		test("unconstrained ResourceShape → Resource", () => {
			expectTypeOf<Instance<ResourceShape>>().toExtend<Resource>();
		});

	});

	describe("lazy shapes", () => {

		test("thunk → the state of the shape it returns", () => {
			expectTypeOf<Instance<() => LabelShape>>().toEqualTypeOf<LabelState>();
		});

		test("thunk and shape agree", () => {
			expectTypeOf<Instance<() => BooleanShape>>().toEqualTypeOf<Instance<BooleanShape>>();
		});

	});

	test("rejects a non-shape", () => {
		// @ts-expect-error - string is not a shape
		expectTypeOf<Instance<string>>().toBeNever();
	});

});
