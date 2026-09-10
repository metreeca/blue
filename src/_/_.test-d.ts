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

import type { Optional } from "@metreeca/core";
import type { Reference, Resource } from "@metreeca/qest/resource";
import { describe, expectTypeOf, test } from "vitest";
import {
	type Draft,
	type State
} from "./_.js";
import { type BooleanShape } from "./boolean.js";
import { reference, type ReferenceShape } from "./reference.js";
import { number } from "./number.js";
import {
	type Carried,
	type Id,
	id,
	multiple,
	optional,
	type Property,
	required,
	resource,
	type ResourceShape,
	type Type,
	type as typed
} from "./resource.js";
import { type StringShape, string } from "./string.js";


type LabelShape={

	readonly kind: "resource",
	readonly parents: [],

	readonly members: {
		readonly label: Property<StringShape, 1, 1>
	}

}

type LabelState={ readonly label: string }


describe("State", () => {

	describe("reference shapes", () => {

		test("ReferenceShape → an IRI", () => {
			expectTypeOf<State<ReferenceShape>>().toEqualTypeOf<Reference>();
		});

	});

	describe("resource shapes", () => {

		test("ResourceShape → the instance its members describe", () => {
			expectTypeOf<State<LabelShape>>().toEqualTypeOf<LabelState>();
		});

		test("unconstrained ResourceShape → Resource", () => {
			expectTypeOf<State<ResourceShape>>().toExtend<Resource>();
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

});


describe("Draft", () => {

	function target() {
		return resource({ id: id(), label: required(string()) });
	}

	const shape=resource({

		id: id(),

		plain: required(string()),
		linked: required(reference(target)),
		owned: required(reference(target), { captive: true }),
		many: multiple(reference(target), { captive: true }),

		derived: required(string(), { computed: true }),
		borrowed: required(reference(target), { foreign: true })

	});

	type Submitted=Draft<typeof shape>

	test("carries a plain member as the state does", () => {
		expectTypeOf<Submitted["plain"]>().toEqualTypeOf<string>();
	});

	test("carries a plain reference as an IRI", () => {
		expectTypeOf<Submitted["linked"]>().toEqualTypeOf<Reference>();
	});

	test("admits a captive target inline alongside its IRI", () => {
		expectTypeOf<Submitted["owned"]>().toEqualTypeOf<Reference | Draft<ReturnType<typeof target>>>();
	});

	test("admits captive targets inline at every cardinality", () => {
		expectTypeOf<Submitted["many"]>()
			.toEqualTypeOf<undefined | readonly (Reference | Draft<ReturnType<typeof target>>)[]>();
	});

	test("drafts a captive target in its own right", () => {
		expectTypeOf<Draft<ReturnType<typeof target>>["label"]>().toEqualTypeOf<string>();
	});

	test("leaves an identifier optional", () => {
		expectTypeOf<Submitted>().toExtend<{ id?: Reference }>();
		expectTypeOf<undefined>().toExtend<Submitted["id"]>();
	});

	test("leaves a computed member optional", () => {
		expectTypeOf<undefined>().toExtend<Submitted["derived"]>();
	});

	test("omits a foreign member", () => {
		expectTypeOf<keyof Submitted>().toEqualTypeOf<
			"id" | "plain" | "linked" | "owned" | "many" | "derived"
		>();
	});

	test("resolves a scalar shape as the state does", () => {
		expectTypeOf<Draft<StringShape>>().toEqualTypeOf<string>();
		expectTypeOf<Draft<ReferenceShape>>().toEqualTypeOf<Reference>();
	});

});


describe("Carried", () => {

	type NamedShape={

		readonly kind: "resource",
		readonly parents: [LabelShape],

		readonly members: {
			readonly name: Property<StringShape, 1, 1>
		}

	}

	test("ResourceShape → the members it declares", () => {
		expectTypeOf<keyof Carried<LabelShape>>().toEqualTypeOf<"label">();
		expectTypeOf<Carried<LabelShape>["label"]>().toEqualTypeOf<Property<StringShape, 1, 1>>();
	});

	test("ResourceShape → the declared members merged over the inherited ones", () => {
		expectTypeOf<keyof Carried<NamedShape>>().toEqualTypeOf<"label" | "name">();
	});

	test("thunk → the members of the shape it returns", () => {
		expectTypeOf<Carried<() => LabelShape>>().toEqualTypeOf<Carried<LabelShape>>();
	});

	test("scalar shape → no member at all", () => {
		expectTypeOf<Carried<StringShape>>().toEqualTypeOf<{}>();
		expectTypeOf<Carried<ReferenceShape>>().toEqualTypeOf<{}>();
	});

});
