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
import { type Instance, type Proposal } from "./index.js";
import { type NumberShape } from "./number.js";
import { reference, type ReferenceShape } from "./reference.js";
import { id, type Id, multiple, type Property, required, resource } from "./resource.js";
import { string, type StringShape } from "./string.js";
import { type Branch, union, type UnionShape } from "./union.js";


type LinkShape={

	readonly kind: "resource",
	readonly parents: [],

	readonly members: {
		readonly id: Id,
		readonly label: Property<StringShape, 1, 1>
	}

}


describe("Branch", () => {

	test("union shape → the shape of every branch", () => {
		expectTypeOf<Branch<UnionShape<[StringShape, ReferenceShape]>>>().toEqualTypeOf<StringShape | ReferenceShape>();
	});

	test("lazy union → the branches of the shape it returns", () => {
		expectTypeOf<Branch<() => UnionShape<[StringShape]>>>().toEqualTypeOf<StringShape>();
	});

	test("lazy branch → the deferred shape as declared", () => {
		expectTypeOf<Branch<UnionShape<[() => LinkShape]>>>().toEqualTypeOf<() => LinkShape>();
	});

	test("non-union shape → no branch at all", () => {
		expectTypeOf<Branch<StringShape>>().toBeNever();
	});

});


describe("union values", () => {

	test("retrieves the value of every branch", () => {
		expectTypeOf<Instance<UnionShape<[StringShape, ReferenceShape]>>>().toEqualTypeOf<string | Reference>();
	});

	test("retrieves a resource branch as the instance it describes", () => {
		expectTypeOf<Instance<UnionShape<[StringShape, LinkShape]>>>().toEqualTypeOf<string | Instance<LinkShape>>();
	});

	test("retrieves a lazy branch as the value of the shape it returns", () => {
		expectTypeOf<Instance<UnionShape<[() => LinkShape]>>>().toEqualTypeOf<Instance<LinkShape>>();
	});

	test("retrieves a narrowed branch as the values it enumerates", () => {
		expectTypeOf<Instance<UnionShape<[StringShape<"home" | "work">, NumberShape]>>>()
			.toEqualTypeOf<"home" | "work" | number>();
	});

	test("flattens a nested union into the values of its leaves", () => {
		expectTypeOf<Instance<UnionShape<[StringShape, UnionShape<[NumberShape, ReferenceShape]>]>>>()
			.toEqualTypeOf<string | number | Reference>();
	});

	test("flattens a nested union deferred to break definition cycles", () => {
		expectTypeOf<Instance<UnionShape<[StringShape, () => UnionShape<[NumberShape, LinkShape]>]>>>()
			.toEqualTypeOf<string | number | Instance<LinkShape>>();
	});

	test("submits the payload of every branch", () => {
		expectTypeOf<Proposal<UnionShape<[StringShape, LinkShape]>>>().toEqualTypeOf<string | Proposal<LinkShape>>();
	});

	test("submits a nested union as the payloads of its leaves", () => {
		expectTypeOf<Proposal<UnionShape<[StringShape, UnionShape<[NumberShape, LinkShape]>]>>>()
			.toEqualTypeOf<string | number | Proposal<LinkShape>>();
	});

	test("submits a resource branch in its submitted form rather than its retrieved one", () => {
		expectTypeOf<Proposal<UnionShape<[LinkShape]>>>().not.toEqualTypeOf<Instance<UnionShape<[LinkShape]>>>();
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
