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
import type { Reference, Value } from "@metreeca/qest/state";
import { describe, expectTypeOf, it } from "vitest";
import { reference } from "../reference/index.js";
import { id, multiple, required, resource, type ResourceShape } from "../resource/index.js";
import { string } from "../string/index.js";
import { items } from "./accessors.js";
import type { Items, Match, Slice } from "./index.js";


const Item = resource({ id: id(), label: required(string()) });


const Catalogue = resource({ id: id(), label: required(string()), members: multiple(reference(Item)) });


describe("items", () => {

	it("should type the items as the template narrows them", async () => {
		expectTypeOf(items<typeof Catalogue, { members: { label: {} } }>).returns
			.toEqualTypeOf<readonly { readonly label: string }[]>();
	});

	it("should admit the rows of a projection over the items", async () => {
		expectTypeOf<{ readonly members: readonly { readonly n: Optional<Value> }[] }>()
			.toExtend<Parameters<typeof items<typeof Catalogue, { members: { "n=label": {} } }>>[0]>();
	});

	it("should type the rows of a projection over the items", async () => {
		expectTypeOf(items<typeof Catalogue, { members: { "n=label": {} } }>).returns
			.toEqualTypeOf<readonly { readonly n: Optional<Value> }[]>();
	});

	it("should admit the match of a slice under generic shapes", async () => {

		function probe<S extends Lazy<ResourceShape>, T extends Slice<S, T>>(match: Match<S, T>, model: T): Items<S, T> {
			return items(match, model);
		}

	});

	it("should type the items as they come for an atomic", async () => {
		expectTypeOf(items<typeof Catalogue, { members: {} }>).returns.toEqualTypeOf<readonly Reference[]>();
	});

	it("should type the items as any values for the erased shape", async () => {
		expectTypeOf(items<Lazy<ResourceShape>, { items: { label: {} } }>).returns.toEqualTypeOf<readonly Value[]>();
	});

	it("should reject slices naming a single-valued property", async () => {
		// @ts-expect-error label is single-valued
		expectTypeOf(items<typeof Catalogue, { label: {} }>).returns.toBeArray();
	});

	it("should reject slices naming more than one property", async () => {
		// @ts-expect-error a slice names a single property
		expectTypeOf(items<typeof Catalogue, { members: {}, label: {} }>).returns.toBeArray();
	});

});
