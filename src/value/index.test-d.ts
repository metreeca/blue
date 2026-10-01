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


import type { Lazy, Optional } from "@metreeca/core";
import type { Tag } from "@metreeca/core/language";
import type { Template } from "@metreeca/qest/model";
import type { Reference, Resource, Value, Values } from "@metreeca/qest/state";
import { assertType, describe, expectTypeOf, it, test } from "vitest";
import { type BooleanShape } from "../boolean/index.js";
import { dictionary, type DictionaryShape } from "../dictionary/index.js";
import { integer, number } from "../number/index.js";
import { reference, type ReferenceShape } from "../reference/index.js";
import { id, multiple, optional, type Property, required, resource, type ResourceShape } from "../resource/index.js";
import { string, type StringShape } from "../string/index.js";
import { union } from "../union/index.js";
import {
	type Items,
	type Draft,
	type Frame,
	type Model,
	type Match,
	type Range,
	type Slice,
	type State
} from "./index.js";


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

const Member = resource({ id: id(), label: required(string()) });
const Note = resource({ text: required(string()) });

const Catalogue = resource({

	id: id(),

	members: multiple(reference(Member)),
	notes: multiple(Note),
	tags: multiple(string())

});

const Special = resource(Catalogue, { extras: multiple(reference(() => Member)) });


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

describe("State", () => {

	describe("dictionary shapes", () => {

		test("DictionaryShape → a tag-keyed map of arrays", () => {
			expectTypeOf<State<DictionaryShape>>().toEqualTypeOf<Plural>();
		});

		test("unique-tagged DictionaryShape → a tag-keyed map of strings", () => {
			expectTypeOf<State<UniqueShape>>().toEqualTypeOf<Singular>();
		});

	});

	describe("reference shapes", () => {

		test("ReferenceShape → an IRI", () => {
			expectTypeOf<State<ReferenceShape>>().toEqualTypeOf<Reference>();
		});

	});

	describe("lazy shapes", () => {

		test("thunk → the state of the shape it returns", () => {
			expectTypeOf<State<() => LabelShape>>().toEqualTypeOf<LabelState>();
		});

		test("thunk and shape agree", () => {
			expectTypeOf<State<() => BooleanShape>>().toEqualTypeOf<State<BooleanShape>>();
		});

	});

	test("rejects a non-shape", () => {
		// @ts-expect-error - string is not a shape
		expectTypeOf<State<string>>().toBeNever();
	});

	describe("resource shape", () => {

		test("ResourceShape → the instance its members describe", () => {
			expectTypeOf<State<LabelShape>>().toEqualTypeOf<LabelState>();
		});

		test("satisfies the resource contract", async () => {
			expectTypeOf<State<LabelShape>>().toExtend<Resource>();
		});

		test("satisfies the resource contract when deferred", async () => {
			expectTypeOf<State<() => LabelShape>>().toExtend<Resource>();
		});

		test("satisfies the resource contract for a generic shape", async () => {
			// expectTypeOf defers on generic types: assignability is checked on a value of the generic instance instead
			<S extends Lazy<ResourceShape>>(instance: State<S>) => assertType<Resource>(instance);
		});

		test("resolves to any resource for the erased shape", async () => {
			expectTypeOf<State<ResourceShape>>().toEqualTypeOf<Resource>();
			expectTypeOf<State<Lazy<ResourceShape>>>().toEqualTypeOf<Resource>();
		});

		test("admits the state of any shape under the erased shape", async () => {
			expectTypeOf<State<typeof Member>>().toExtend<State<ResourceShape>>();
			expectTypeOf<State<typeof Catalogue>>().toExtend<State<Lazy<ResourceShape>>>();
		});

	});

});

describe("Draft", () => {

	describe("resources", () => {

		it("should make the member naming the resource optional", async () => {
			expectTypeOf<Draft<typeof Member>>().toEqualTypeOf<{ readonly label: string, readonly id?: string }>();
		});

		it("should leave shapes without a naming member as they are", async () => {
			expectTypeOf<Draft<typeof Note>>().toEqualTypeOf<{ readonly text: string }>();
		});

		it("should resolve to any resource for the erased shape", async () => {
			expectTypeOf<Draft<ResourceShape>>().toEqualTypeOf<Resource>();
			expectTypeOf<Draft<Lazy<ResourceShape>>>().toEqualTypeOf<Resource>();
		});

		it("should admit the draft of any shape under the erased shape", async () => {
			expectTypeOf<Draft<typeof Member>>().toExtend<Draft<ResourceShape>>();
			expectTypeOf<Draft<typeof Catalogue>>().toExtend<Draft<Lazy<ResourceShape>>>();
		});

	});

	describe("collections", () => {

		it("should draft the resources the references of a property point at", async () => {
			expectTypeOf<Draft<typeof Catalogue, { members: {} }>>().toEqualTypeOf<Draft<typeof Member>>();
		});

		it("should draft the resources a property embeds", async () => {
			expectTypeOf<Draft<typeof Catalogue, { notes: {} }>>().toEqualTypeOf<Draft<typeof Note>>();
		});

		it("should resolve inherited properties", async () => {
			expectTypeOf<Draft<typeof Special, { members: {} }>>().toEqualTypeOf<Draft<typeof Member>>();
		});

		it("should resolve deferred shapes", async () => {
			expectTypeOf<Draft<() => typeof Special, { extras: {} }>>().toEqualTypeOf<Draft<typeof Member>>();
		});

		it("should reject properties collecting anything other than resources", async () => {
			expectTypeOf<Draft<typeof Catalogue, { tags: {} }>>().toBeNever();
		});

		it("should resolve to any resource for the erased shape", async () => {
			expectTypeOf<Draft<Lazy<ResourceShape>, { items: {} }>>().toEqualTypeOf<Resource>();
		});

		it("should resolve to any resource for the erased model", async () => {
			expectTypeOf<Draft<typeof Catalogue, Template>>().toEqualTypeOf<Resource>();
			expectTypeOf<Draft<Lazy<ResourceShape>, Template>>().toEqualTypeOf<Resource>();
		});

		it("should resolve to a resource state under generic shapes", async () => {

			function probe<S extends Lazy<ResourceShape>, T extends Slice<S, T>>(draft: Draft<S, T>): Resource {
				return draft;
			}

		});

	});

});

describe("Match", () => {

	const Vendor = resource({

		id: id(),

		name: required(string()),
		code: optional(integer())

	});

	const Product = resource({

		id: id(),

		name: required(string()),
		size: optional(integer()),

		tags: multiple(string()),
		label: optional(dictionary({ uniqueLang: true })),

		vendor: optional(reference(Vendor)),
		vendors: multiple(reference(Vendor)),

		rating: optional(resource({ average: required(number()) })),

		code: optional(union(string(), integer()))

	});

	describe("templates", () => {

		it("carries the members the template names", async () => {

			expectTypeOf<Match<typeof Product, { name: {}, size: {} }>>()
				.toEqualTypeOf<{ readonly name: string, readonly size?: undefined | number }>();

		});

		it("leaves out the members the template doesn't name", async () => {

			expectTypeOf<Match<typeof Product, { name: {} }>>()
				.toEqualTypeOf<{ readonly name: string }>();

		});

		it("carries the identifier under the member naming the resource", async () => {

			expectTypeOf<Match<typeof Product, { id: {} }>>()
				.toEqualTypeOf<{ readonly id: Reference }>();

		});

		it("keeps the cardinality the shape states", async () => {

			expectTypeOf<Match<typeof Product, { tags: {} }>>()
				.toEqualTypeOf<{ readonly tags?: undefined | readonly string[] }>();

		});

		it("carries a localised member as the shape describes it", async () => {

			expectTypeOf<Match<typeof Product, { label: { "*": {} } }>>()
				.toEqualTypeOf<{ readonly label?: undefined | { readonly [tag: Tag]: string } }>();

		});

		// a link asked for by the atomic placeholder comes back as the identifier naming its target

		it("carries a link left unexpanded as a reference", async () => {

			expectTypeOf<Match<typeof Product, { vendor: {} }>>()
				.toEqualTypeOf<{ readonly vendor?: undefined | Reference }>();

		});

		it("narrows an expanded link to what the nested template asked for", async () => {

			expectTypeOf<Match<typeof Product, { vendor: { name: {} } }>>()
				.toEqualTypeOf<{ readonly vendor?: undefined | { readonly name: string } }>();

		});

		it("narrows an embedded resource to what the nested template asked for", async () => {

			expectTypeOf<Match<typeof Product, { rating: { average: {} } }>>()
				.toEqualTypeOf<{ readonly rating?: undefined | { readonly average: number } }>();

		});

		// a collection carries its constraints alongside the keys retrieving its values, and neither reaches the type

		it("narrows a collection to the per-item keys, leaving its constraints out", async () => {

			expectTypeOf<Match<typeof Product, { vendors: { name: {}, "#": 10 } }>>()
				.toEqualTypeOf<{ readonly vendors?: undefined | readonly { readonly name: string }[] }>();

		});

		// what the provisional bridge does not narrow falls back to what the shape describes

		it("falls back to the shape for a polymorphic member", async () => {

			expectTypeOf<Match<typeof Product, { code: { "0": {} } }>>()
				.toEqualTypeOf<{ readonly code?: undefined | string | number }>();

		});

		it("carries nothing for a template asking for nothing", async () => {

			expectTypeOf<Match<typeof Product, {}>>().toEqualTypeOf<{}>();

		});

		it("carries the members the template names as any values for the erased shape", async () => {

			expectTypeOf<Match<Lazy<ResourceShape>, { name: {}, vendors: { name: {} } }>>()
				.toEqualTypeOf<{ readonly name: Optional<Values>, readonly vendors: Optional<Values> }>();

		});

		it("carries nothing for the erased model", async () => {

			expectTypeOf<Match<typeof Product, Template>>().toEqualTypeOf<{}>();
			expectTypeOf<Match<Lazy<ResourceShape>, Template>>().toEqualTypeOf<{}>();

		});

	});

	describe("projections", () => {

		it("carries one column per binding, keyed by the bound name", async () => {

			expectTypeOf<Match<typeof Product, { "vendor=vendors.name": {}, "count=count:": {} }>>()
				.toEqualTypeOf<{ readonly vendor: Optional<Value>, readonly count: Optional<Value> }>();

		});

		it("carries the rows of a projection over a collection", async () => {

			expectTypeOf<Match<typeof Product, { vendors: { "n=name": {}, "^n": "asc" } }>>()
				.toEqualTypeOf<{ readonly vendors?: undefined | readonly { readonly n: Optional<Value> }[] }>();

		});

	});

	describe("criteria", () => {

		it("leaves the criteria of a template out of the match", async () => {

			expectTypeOf<Match<typeof Product, { name: {}, "~name": "widget", "#": 10 }>>()
				.toEqualTypeOf<{ readonly name: string }>();

		});

		it("leaves the criteria of a projection out of the match", async () => {

			expectTypeOf<Match<typeof Product, { "vendor=vendors.name": {}, "^vendor": "asc" }>>()
				.toEqualTypeOf<{ readonly vendor: Optional<Value> }>();

		});

	});

});

describe("Model", () => {

	const Vendor = resource({

		id: id(),

		name: required(string())

	});

	const Product = resource({

		id: id(),

		name: required(string()),
		tags: multiple(string()),
		label: optional(dictionary({ uniqueLang: true })),

		vendor: optional(reference(Vendor)),
		vendors: multiple(reference(Vendor)),

		rating: optional(resource({ average: required(number()) })),

		code: optional(union(string(), integer()))

	});

	const Special = resource(Product, { extra: required(string()) });

	type Products = Model<typeof Product>;

	describe("members", () => {

		test("admits an atomic for every member", () => {
			expectTypeOf<{
				id: {}, name: {}, tags: {}, label: {}, vendor: {}, vendors: {}, rating: {}, code: {}
			}>().toExtend<Products>();
		});

		test("admits the members a shape inherits", () => {
			expectTypeOf<{ name: {}, extra: {} }>().toExtend<Model<typeof Special>>();
		});

		test("admits the members of a deferred shape", () => {
			expectTypeOf<{ name: {} }>().toExtend<Model<() => typeof Product>>();
		});

		test("rejects a template naming no member the shape carries", () => {
			expectTypeOf<{ nme: {} }>().not.toExtend<Model<typeof Product, { nme: {} }>>();
		});

		test("rejects criteria on the resource itself", () => {
			expectTypeOf<{ "#": 10 }>().not.toExtend<Products>();
		});

	});

	describe("templates", () => {

		test("admits a nested template on a link", () => {
			expectTypeOf<{ vendor: { id: {}, name: {} } }>().toExtend<Products>();
		});

		test("admits a nested template on an embedded resource", () => {
			expectTypeOf<{ rating: { average: {} } }>().toExtend<Products>();
		});

		test("rejects a nested template on a scalar member", () => {
			expectTypeOf<{ name: { length: {} } }>().not.toExtend<Products>();
		});

		test("rejects a nested template naming no member of the target", () => {
			expectTypeOf<{ vendor: { nme: {} } }>().not.toExtend<Products>();
		});

	});

	describe("locales", () => {

		test("admits a locale on a localised member", () => {
			expectTypeOf<{ label: { "*": {} } }>().toExtend<Products>();
			expectTypeOf<{ label: { en: {}, fr: {} } }>().toExtend<Products>();
		});

		test("rejects a locale on a member carrying no localised text", () => {
			expectTypeOf<{ name: { "*": {} } }>().not.toExtend<Products>();
		});

	});

	describe("unions", () => {

		test("admits branches on a member admitting several kinds", () => {
			expectTypeOf<{ code: { "0": {}, "1": {} } }>().toExtend<Products>();
		});

		test("rejects branches on a member admitting one kind", () => {
			expectTypeOf<{ name: { "0": {} } }>().not.toExtend<Products>();
		});

	});

	describe("queries", () => {

		test("admits criteria on a collection", () => {
			expectTypeOf<{ vendors: { name: {}, "~name": "acme", "^name": "asc", "#": 10 } }>().toExtend<Products>();
			expectTypeOf<{ tags: { "#": 5 } }>().toExtend<Products>();
		});

		test("admits a projection on a collection", () => {
			expectTypeOf<{ vendors: { "n=name": {}, "count=count:": {} } }>().toExtend<Products>();
		});

		test("rejects criteria on a single-valued member", () => {
			expectTypeOf<{ vendor: { "#": 10 } }>().not.toExtend<Products>();
		});

		test("rejects a projection on a single-valued member", () => {
			expectTypeOf<{ vendor: { "n=name": {} } }>().not.toExtend<Products>();
		});

	});

});

describe("Slice", () => {

	it("should admit a template on a property collecting resources", async () => {
		expectTypeOf<{ members: { label: {} } }>().toExtend<Slice<typeof Catalogue, { members: { label: {} } }>>();
	});

	it("should admit the criteria a collection model carries", async () => {
		expectTypeOf<{ members: { label: {}, "~label": "x", "#": 10 } }>()
			.toExtend<Slice<typeof Catalogue, { members: { label: {}, "~label": "x", "#": 10 } }>>();
	});

	it("should admit a projection over the collected shape", async () => {
		expectTypeOf<{ members: { "count=count(label)": {} } }>()
			.toExtend<Slice<typeof Catalogue, { members: { "count=count(label)": {} } }>>();
	});

	it("should admit an inherited property", async () => {
		expectTypeOf<{ extras: { label: {} } }>().toExtend<Slice<typeof Special, { extras: { label: {} } }>>();
	});

	it("should reject a template naming no member the collected shape carries", async () => {
		expectTypeOf<{ members: { label: {}, text: {} } }>()
			.not.toExtend<Slice<typeof Catalogue, { members: { label: {}, text: {} } }>>();
	});

	it("should reject a property collecting anything other than resources", async () => {
		expectTypeOf<{ tags: {} }>().not.toExtend<Slice<typeof Catalogue, { tags: {} }>>();
	});

	it("should reject a property holding at most one value", async () => {
		expectTypeOf<{ id: {} }>().not.toExtend<Slice<typeof Catalogue, { id: {} }>>();
	});

	it("should reject a property the shape doesn't carry", async () => {
		expectTypeOf<{ others: {} }>().not.toExtend<Slice<typeof Catalogue, { others: {} }>>();
	});

	it("should reject a model naming no property", async () => {
		expectTypeOf<{}>().not.toExtend<Slice<typeof Catalogue, {}>>();
	});

	it("should reject a model naming several properties", async () => {
		expectTypeOf<{ members: { label: {} }, notes: { text: {} } }>()
			.not.toExtend<Slice<typeof Catalogue, { members: { label: {} }, notes: { text: {} } }>>();
	});

	it("should hold the model to the templates the holding shape admits under generic shapes", async () => {

		function probe<S extends Lazy<ResourceShape>, T extends Slice<S, T>>(model: T): Model<S, T> {
			return model;
		}

	});

	it("should admit any template for the erased shape and model", async () => {
		expectTypeOf<Template>().toExtend<Slice<Lazy<ResourceShape>, Template>>();
	});

	it("should admit any collection model for the erased shape", async () => {
		expectTypeOf<{ items: {} }>().toExtend<Slice<Lazy<ResourceShape>, { items: {} }>>();
		expectTypeOf<{ items: { label: {}, "~label": "x", "#": 10 } }>()
			.toExtend<Slice<Lazy<ResourceShape>, { items: { label: {}, "~label": "x", "#": 10 } }>>();
		expectTypeOf<{ items: { "n=label": {} } }>().toExtend<Slice<Lazy<ResourceShape>, { items: { "n=label": {} } }>>();
	});

	it("should hold the model to a single property for the erased shape", async () => {
		expectTypeOf<{}>().not.toExtend<Slice<Lazy<ResourceShape>, {}>>();
		expectTypeOf<{ items: {}, notes: {} }>().not.toExtend<Slice<Lazy<ResourceShape>, { items: {}, notes: {} }>>();
	});

});

describe("Items", () => {

	it("should narrow linked items to the values a template asks for", async () => {
		expectTypeOf<Items<typeof Catalogue, { members: { label: {} } }>>()
			.toEqualTypeOf<readonly { readonly label: string }[]>();
	});

	it("should narrow embedded items to the values a template asks for", async () => {
		expectTypeOf<Items<typeof Catalogue, { notes: { text: {} } }>>()
			.toEqualTypeOf<readonly { readonly text: string }[]>();
	});

	it("should admit the criteria a collection model carries", async () => {
		expectTypeOf<Items<typeof Catalogue, { members: { label: {}, "~label": "x", "#": 10 } }>>()
			.toEqualTypeOf<readonly { readonly label: string }[]>();
	});

	it("should hand back rows for a projection over the items, criteria included", async () => {
		expectTypeOf<Items<typeof Catalogue, { members: { "n=label": {}, "^n": "asc" } }>>()
			.toEqualTypeOf<readonly { readonly n: Optional<Value> }[]>();
	});

	it("should hand back the items as they come for an atomic", async () => {
		expectTypeOf<Items<typeof Catalogue, { members: {} }>>().toEqualTypeOf<readonly Reference[]>();
	});

	it("should resolve to the items of the model under generic shapes", async () => {

		function probe<S extends Lazy<ResourceShape>, T extends Slice<S, T>>(items: Items<S, T>): unknown {
			return items;
		}

	});

	it("should resolve to an array of items under generic shapes", async () => {

		function probe<S extends Lazy<ResourceShape>, T extends Slice<S, T>>(items: Items<S, T>): Iterable<Frame<S, T>> {
			return items;
		}

	});

	it("should resolve to any values for the erased model", async () => {
		expectTypeOf<Items<Lazy<ResourceShape>, Template>>().toEqualTypeOf<readonly Value[]>();
		expectTypeOf<Items<typeof Catalogue, Template>>().toEqualTypeOf<readonly Value[]>();
	});

	it("should resolve to any values for the erased shape", async () => {
		expectTypeOf<Items<Lazy<ResourceShape>, { items: { label: {} } }>>().toEqualTypeOf<readonly Value[]>();
		expectTypeOf<Items<Lazy<ResourceShape>, { items: { "n=label": {} } }>>().toEqualTypeOf<readonly Value[]>();
	});

	it("should admit the items of any shape under the erased shape and model", async () => {
		expectTypeOf<Items<typeof Catalogue, { members: { label: {} } }>>().toExtend<Items<Lazy<ResourceShape>, Template>>();
		expectTypeOf<Items<typeof Catalogue, { members: { "n=label": {} } }>>()
			.toExtend<Items<Lazy<ResourceShape>, Template>>();
	});

});

describe("Frame", () => {

	it("should narrow linked items to the values a template asks for", async () => {
		expectTypeOf<Frame<typeof Catalogue, { members: { label: {} } }>>()
			.toEqualTypeOf<{ readonly label: string }>();
	});

	it("should narrow embedded items to the values a template asks for", async () => {
		expectTypeOf<Frame<typeof Catalogue, { notes: { text: {} } }>>()
			.toEqualTypeOf<{ readonly text: string }>();
	});

	it("should admit the criteria a collection model carries", async () => {
		expectTypeOf<Frame<typeof Catalogue, { members: { label: {}, "~label": "x", "#": 10 } }>>()
			.toEqualTypeOf<{ readonly label: string }>();
	});

	it("should hand back a row for a projection over the items", async () => {
		expectTypeOf<Frame<typeof Catalogue, { members: { "n=label": {}, "^n": "asc" } }>>()
			.toEqualTypeOf<{ readonly n: Optional<Value> }>();
	});

	it("should hand back the item as it comes for an atomic", async () => {
		expectTypeOf<Frame<typeof Catalogue, { members: {} }>>().toEqualTypeOf<Reference>();
	});

	it("should resolve to the elements of the items", async () => {
		expectTypeOf<Frame<typeof Catalogue, { members: { label: {} } }>>()
			.toEqualTypeOf<Items<typeof Catalogue, { members: { label: {} } }>[number]>();
		expectTypeOf<Frame<typeof Catalogue, { members: { "n=label": {} } }>>()
			.toEqualTypeOf<Items<typeof Catalogue, { members: { "n=label": {} } }>[number]>();
	});

	it("should resolve to any value for the erased model", async () => {
		expectTypeOf<Frame<Lazy<ResourceShape>, Template>>().toEqualTypeOf<Value>();
		expectTypeOf<Frame<typeof Catalogue, Template>>().toEqualTypeOf<Value>();
	});

	it("should resolve to any value for the erased shape", async () => {
		expectTypeOf<Frame<Lazy<ResourceShape>, { items: { label: {} } }>>().toEqualTypeOf<Value>();
		expectTypeOf<Frame<Lazy<ResourceShape>, { items: { "n=label": {} } }>>().toEqualTypeOf<Value>();
	});

});
