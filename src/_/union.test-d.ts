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

import type { Reference } from "@metreeca/qest/resource";
import { describe, expectTypeOf, test } from "vitest";
import { type Instance, type Proposal } from "./_.js";
import { type NumberShape } from "./number.js";
import { reference, type ReferenceShape } from "./reference.js";
import { id, type Id, multiple, type Property, required, resource } from "./resource.js";
import { string, type StringShape } from "./string.js";
import { type Drawn, type Offered, union, type UnionShape } from "./union.js";


type LinkShape={

	readonly kind: "resource",
	readonly parents: [],

	readonly members: {
		readonly id: Id,
		readonly label: Property<StringShape, 1, 1>
	}

}


describe("Drawn", () => {

	test("union shape → the value of every branch", () => {
		expectTypeOf<Drawn<UnionShape<[StringShape, ReferenceShape]>>>().toEqualTypeOf<string | Reference>();
	});

	test("resource branch → the instance it describes", () => {
		expectTypeOf<Drawn<UnionShape<[StringShape, LinkShape]>>>().toEqualTypeOf<string | Instance<LinkShape>>();
	});

	test("lazy branch → the value of the shape it returns", () => {
		expectTypeOf<Drawn<UnionShape<[() => LinkShape]>>>().toEqualTypeOf<Instance<LinkShape>>();
	});

	test("narrowed branch → the values it enumerates", () => {
		expectTypeOf<Drawn<UnionShape<[StringShape<"home" | "work">, NumberShape]>>>()
			.toEqualTypeOf<"home" | "work" | number>();
	});

	test("non-union shape → no value at all", () => {
		expectTypeOf<Drawn<StringShape>>().toBeNever();
	});

});


describe("Offered", () => {

	test("union shape → the payload of every branch", () => {
		expectTypeOf<Offered<UnionShape<[StringShape, LinkShape]>>>().toEqualTypeOf<string | Proposal<LinkShape>>();
	});

	test("resource branch → its submitted form rather than its retrieved one", () => {
		expectTypeOf<Offered<UnionShape<[LinkShape]>>>().not.toEqualTypeOf<Drawn<UnionShape<[LinkShape]>>>();
	});

	test("non-union shape → no value at all", () => {
		expectTypeOf<Offered<StringShape>>().toBeNever();
	});

});


describe("union ranges", () => {

	function target() {
		return resource({ id: id(), label: required(string()) });
	}

	const shape=resource({

		id: id(),

		location: required(union(string(), reference(target))),
		locations: multiple(union(string(), reference(target)))

	});

	type Retrieved=Instance<typeof shape>
	type Submitted=Proposal<typeof shape>

	test("carries a union-valued member as the value of every branch", () => {
		expectTypeOf<Retrieved["location"]>().toEqualTypeOf<string | Reference>();
	});

	test("repeats a union-valued member as an array of the values of every branch", () => {
		expectTypeOf<Retrieved["locations"]>().toEqualTypeOf<undefined | readonly (string | Reference)[]>();
	});

	test("submits a union-valued member as it is retrieved", () => {
		expectTypeOf<Submitted["location"]>().toEqualTypeOf<Retrieved["location"]>();
	});

});
