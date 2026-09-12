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
import type { Reference, Resource } from "@metreeca/qest/resource";
import { describe, expectTypeOf, test } from "vitest";
import { type BooleanShape } from "./boolean.js";
import { type DictionaryShape } from "./dictionary.js";
import { type Compound, type Instance, type Range } from "./index.js";
import { reference, type ReferenceShape } from "./reference.js";
import { id, multiple, type Property, required, resource, type ResourceShape } from "./resource/index.js";
import { string, type StringShape } from "./string.js";


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


describe("Compound", () => {

	function target() {
		return resource({ id: id(), label: required(string()) });
	}

	const shape=resource({

		id: id(),

		plain: required(string()),
		linked: required(reference(target)),
		owned: required(reference(target), { captive: true }),
		many: multiple(reference(target), { captive: true }),

		borrowed: required(reference(target), { foreign: true })

	});

	type Submitted=Compound<typeof shape>

	test("carries a plain member as the state does", () => {
		expectTypeOf<Submitted["plain"]>().toEqualTypeOf<string>();
	});

	test("carries a plain reference as an IRI", () => {
		expectTypeOf<Submitted["linked"]>().toEqualTypeOf<Reference>();
	});

	test("admits a captive target inline alongside its IRI", () => {
		expectTypeOf<Submitted["owned"]>().toEqualTypeOf<Reference | Compound<ReturnType<typeof target>>>();
	});

	test("takes a captive target in either form", () => {
		expectTypeOf<Reference>().toExtend<Submitted["owned"]>();
		expectTypeOf<{ readonly label: string }>().toExtend<Submitted["owned"]>();
	});

	test("admits captive targets inline at every cardinality", () => {
		expectTypeOf<Submitted["many"]>()
			.toEqualTypeOf<undefined | readonly (Reference | Compound<ReturnType<typeof target>>)[]>();
	});

	test("takes captive targets in either form within a single set", () => {
		expectTypeOf<readonly [Reference, { readonly label: string }]>()
			.toExtend<NonNullable<Submitted["many"]>>();
	});

	test("takes a plain reference in reference form alone", () => {
		expectTypeOf<Reference>().toExtend<Submitted["linked"]>();
		expectTypeOf<{ readonly label: string }>().not.toExtend<Submitted["linked"]>();
	});

	test("proposes a captive target in its own right", () => {
		expectTypeOf<Compound<ReturnType<typeof target>>["label"]>().toEqualTypeOf<string>();
	});

	test("leaves an identifier optional", () => {
		expectTypeOf<Submitted>().toExtend<{ id?: Reference }>();
		expectTypeOf<undefined>().toExtend<Submitted["id"]>();
	});

	test("leaves a member optional where it may be left out", () => {
		expectTypeOf<{}>().toExtend<Pick<Submitted, "many">>();
		expectTypeOf<{}>().not.toExtend<Pick<Submitted, "plain">>();
	});

	test("omits a foreign member", () => {
		expectTypeOf<keyof Submitted>().toEqualTypeOf<
			"id" | "plain" | "linked" | "owned" | "many"
		>();
	});

	test("resolves a scalar shape as the state does", () => {
		expectTypeOf<Compound<StringShape>>().toEqualTypeOf<string>();
		expectTypeOf<Compound<ReferenceShape>>().toEqualTypeOf<Reference>();
	});

	test("resolves a localised shape as the state does", () => {
		expectTypeOf<Compound<DictionaryShape>>().toEqualTypeOf<Plural>();
		expectTypeOf<Compound<UniqueShape>>().toEqualTypeOf<Singular>();
	});

});


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
