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
import type { Reference } from "@metreeca/qest/state";
import { describe, expectTypeOf, it } from "vitest";
import type { Delivery } from "./_inference.js";
import { dictionary } from "../dictionary/index.js";
import { integer, number } from "../number/index.js";
import { reference } from "../reference/index.js";
import { id, multiple, optional, required, resource } from "../resource/index.js";
import { string } from "../string/index.js";
import { union } from "../union/index.js";


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


describe("Delivery", () => {

	it("carries the members the template names", async () => {

		expectTypeOf<Delivery<typeof Product, { name: {}, size: {} }>>()
			.toEqualTypeOf<{ readonly name: string, readonly size?: undefined | number }>();

	});

	it("leaves out the members the template doesn't name", async () => {

		expectTypeOf<Delivery<typeof Product, { name: {} }>>()
			.toEqualTypeOf<{ readonly name: string }>();

	});

	it("carries the identifier under the member naming the resource", async () => {

		expectTypeOf<Delivery<typeof Product, { id: {} }>>()
			.toEqualTypeOf<{ readonly id: Reference }>();

	});

	it("keeps the cardinality the shape states", async () => {

		expectTypeOf<Delivery<typeof Product, { tags: {} }>>()
			.toEqualTypeOf<{ readonly tags?: undefined | readonly string[] }>();

	});

	it("carries a localised member as the shape describes it", async () => {

		expectTypeOf<Delivery<typeof Product, { label: { "*": {} } }>>()
			.toEqualTypeOf<{ readonly label?: undefined | { readonly [tag: Tag]: string } }>();

	});

	// a link asked for by the atomic placeholder comes back as the identifier naming its target

	it("carries a link left unexpanded as a reference", async () => {

		expectTypeOf<Delivery<typeof Product, { vendor: {} }>>()
			.toEqualTypeOf<{ readonly vendor?: undefined | Reference }>();

	});

	it("narrows an expanded link to what the nested template asked for", async () => {

		expectTypeOf<Delivery<typeof Product, { vendor: { name: {} } }>>()
			.toEqualTypeOf<{ readonly vendor?: undefined | { readonly name: string } }>();

	});

	it("narrows an embedded resource to what the nested template asked for", async () => {

		expectTypeOf<Delivery<typeof Product, { rating: { average: {} } }>>()
			.toEqualTypeOf<{ readonly rating?: undefined | { readonly average: number } }>();

	});

	// a collection carries its constraints alongside the keys retrieving its values, and neither reaches the type

	it("narrows a collection to the per-item keys, leaving its constraints out", async () => {

		expectTypeOf<Delivery<typeof Product, { vendors: { name: {}, "#": 10 } }>>()
			.toEqualTypeOf<{ readonly vendors?: undefined | readonly { readonly name: string }[] }>();

	});

	it("leaves a slot stated as nothing at all out", async () => {

		expectTypeOf<Delivery<typeof Product, { name: {}, size: undefined }>>()
			.toEqualTypeOf<{ readonly name: string }>();

	});

	// what the provisional bridge does not narrow falls back to what the shape describes

	it("falls back to the shape for a polymorphic member", async () => {

		expectTypeOf<Delivery<typeof Product, { code: { "0": {} } }>>()
			.toEqualTypeOf<{ readonly code?: undefined | string | number }>();

	});

	it("falls back to the shape for a projection column", async () => {

		expectTypeOf<Delivery<typeof Product, { vendors: { "n=name": {} } }>>()
			.toEqualTypeOf<{ readonly vendors?: undefined | readonly Reference[] }>();

	});

	it("carries nothing for a template asking for nothing", async () => {

		expectTypeOf<Delivery<typeof Product, {}>>().toEqualTypeOf<{}>();

	});

});
