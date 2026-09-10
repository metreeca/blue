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
	type BooleanShape,
	boolean,
	type Content,
	type Id,
	id,
	type Inheritance,
	type Instance,
	type NumberShape,
	number,
	type Property,
	property,
	type ResourceShape,
	resource,
	type State,
	type StringShape,
	string,
	type Type,
	type as typed
} from "./_.js";


describe("State", () => {

	describe("unconstrained shapes", () => {

		test("BooleanShape → boolean", () => {
			expectTypeOf<State<BooleanShape>>().toEqualTypeOf<boolean>();
		});

		test("NumberShape → number", () => {
			expectTypeOf<State<NumberShape>>().toEqualTypeOf<number>();
		});

		test("StringShape → string", () => {
			expectTypeOf<State<StringShape>>().toEqualTypeOf<string>();
		});

		test("ResourceShape → Resource", () => {
			expectTypeOf<State<ResourceShape>>().toEqualTypeOf<Resource>();
		});

	});

	describe("constrained shapes", () => {

		test("BooleanShape → its literal type", () => {
			expectTypeOf<State<BooleanShape<true>>>().toEqualTypeOf<true>();
		});

		test("NumberShape → its literal type", () => {
			expectTypeOf<State<NumberShape<1>>>().toEqualTypeOf<1>();
		});

		test("StringShape → its literal type", () => {
			expectTypeOf<State<StringShape<"one">>>().toEqualTypeOf<"one">();
		});

		test("ResourceShape → its record type", () => {
			expectTypeOf<State<ResourceShape<{ readonly label: string }>>>()
				.toEqualTypeOf<{ readonly label: string }>();
		});

	});

	describe("lazy shapes", () => {

		test("thunk → the state of the shape it returns", () => {
			expectTypeOf<State<() => StringShape<"one">>>().toEqualTypeOf<"one">();
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


describe("Content", () => {

	test("Id → its reference type", () => {
		expectTypeOf<Content<Id>>().toEqualTypeOf<Reference>();
	});

	test("Type → its optional reference type", () => {
		expectTypeOf<Content<Type>>().toEqualTypeOf<Optional<Reference>>();
	});

	test("Property → the state of its range", () => {
		expectTypeOf<Content<Property<StringShape>>>().toEqualTypeOf<string>();
	});

	test("Property → the state of a lazy range", () => {
		expectTypeOf<Content<Property<() => StringShape<"one">>>>().toEqualTypeOf<"one">();
	});

	test("Property → the state of a resource range", () => {
		expectTypeOf<Content<Property<ResourceShape<{ readonly label: string }>>>>()
			.toEqualTypeOf<{ readonly label: string }>();
	});

	test("distributes over a member union", () => {
		expectTypeOf<Content<Id | Property<StringShape>>>().toEqualTypeOf<Reference | string>();
	});

});


describe("Instance", () => {

	test("empty members → empty record", () => {
		expectTypeOf<Instance<{}>>().toEqualTypeOf<{}>();
	});

	test("maps each member to its content", () => {
		expectTypeOf<Instance<{
			readonly id: Id,
			readonly type: Type,
			readonly label: Property<StringShape>
		}>>().toEqualTypeOf<{
			readonly id: Reference,
			readonly type: Optional<Reference>,
			readonly label: string
		}>();
	});

	test("preserves member keys", () => {
		expectTypeOf<keyof Instance<{ readonly id: Id, readonly label: Property<StringShape> }>>()
			.toEqualTypeOf<"id" | "label">();
	});

	test("satisfies the resource contract", () => {
		expectTypeOf<Instance<{ readonly label: Property<StringShape> }>>().toExtend<Resource>();
	});

});


describe("Inheritance", () => {

	test("no shapes → an unconstrained state", () => {
		expectTypeOf<Inheritance<[]>>().toEqualTypeOf<unknown>();
	});

	test("single shape → its state", () => {
		expectTypeOf<Inheritance<[ResourceShape<{ readonly label: string }>]>>()
			.toEqualTypeOf<{ readonly label: string }>();
	});

	test("multiple shapes → the intersection of their states", () => {
		expectTypeOf<Inheritance<[
			ResourceShape<{ readonly id: Reference }>,
			ResourceShape<{ readonly label: string }>
		]>>().toEqualTypeOf<{ readonly id: Reference } & { readonly label: string }>();
	});

	test("lazy shape → the state of the shape it returns", () => {
		expectTypeOf<Inheritance<[() => ResourceShape<{ readonly label: string }>]>>()
			.toEqualTypeOf<{ readonly label: string }>();
	});

});


describe("resource", () => {

	test("infers the instance type from its members", () => {
		expectTypeOf(resource({
			id: id(),
			type: typed(),
			label: property(string())
		})).toEqualTypeOf<ResourceShape<{
			readonly id: Reference,
			readonly type: Optional<Reference>,
			readonly label: string
		}>>();
	});

	test("narrows member content to its declared type", () => {
		expectTypeOf(resource({ label: property(string<"one">()) })).toEqualTypeOf<ResourceShape<{
			readonly label: "one"
		}>>();
	});

	test("empty members → empty instance", () => {
		expectTypeOf(resource({})).toEqualTypeOf<ResourceShape<{}>>();
	});

	test("rejects a non-member value", () => {
		// @ts-expect-error - a shape is not a member
		resource({ label: string() });
	});


	test("merges the state of an extended shape into the instance", () => {
		expectTypeOf(resource(resource({ id: id() }), { label: property(string()) }))
			.toEqualTypeOf<ResourceShape<{ readonly id: Reference } & { readonly label: string }>>();
	});

	test("merges the state of every extended shape", () => {
		expectTypeOf(resource(
			resource({ id: id() }),
			resource({ type: typed() }),
			{ label: property(string()) }
		)).toEqualTypeOf<ResourceShape<
			{ readonly id: Reference } & { readonly type: Optional<Reference> } & { readonly label: string }
		>>();
	});

	test("resolves a lazy extended shape", () => {
		const base=resource({ id: id() });

		expectTypeOf(resource(() => base, { label: property(string()) }))
			.toEqualTypeOf<ResourceShape<{ readonly id: Reference } & { readonly label: string }>>();
	});

	test("accepts constraints after the members", () => {
		expectTypeOf(resource(resource({ id: id() }), { label: property(string()) }, {}))
			.toEqualTypeOf<ResourceShape<{ readonly id: Reference } & { readonly label: string }>>();
	});

	test("resolves a lazy property range", () => {
		expectTypeOf(resource({ label: property(() => string<"one">()) })).toEqualTypeOf<ResourceShape<{
			readonly label: "one"
		}>>();
	});

	test("links mutually recursive shapes through lazy ranges", () => {
		const left: ResourceShape<{ readonly right: { readonly label: string } }>=
			resource({ right: property(() => right) });

		const right: ResourceShape<{ readonly label: string }>=
			resource({ label: property(string()) });

		expectTypeOf(left).toEqualTypeOf<ResourceShape<{ readonly right: { readonly label: string } }>>();
	});

	test("rejects a non-shape as an extended shape", () => {
		// @ts-expect-error - a string shape is not a resource shape
		resource(string(), { label: property(string()) });
	});

	test("rejects an extended shape as the members", () => {
		// @ts-expect-error - a resource shape is not a member map
		resource(resource({ id: id() }));
	});

});


describe("shape factories", () => {

	test("boolean → BooleanShape of its argument type", () => {
		expectTypeOf(boolean<true>()).toEqualTypeOf<BooleanShape<true>>();
	});

	test("number → NumberShape of its argument type", () => {
		expectTypeOf(number<1>()).toEqualTypeOf<NumberShape<1>>();
	});

	test("string → StringShape of its argument type", () => {
		expectTypeOf(string<"one">()).toEqualTypeOf<StringShape<"one">>();
	});

});


describe("empty enumerations", () => {

	test("BooleanShape<never> → boolean", () => {
		expectTypeOf<State<BooleanShape<never>>>().toEqualTypeOf<boolean>();
	});

	test("NumberShape<never> → number", () => {
		expectTypeOf<State<NumberShape<never>>>().toEqualTypeOf<number>();
	});

	test("StringShape<never> → string", () => {
		expectTypeOf<State<StringShape<never>>>().toEqualTypeOf<string>();
	});

	test("a populated enumeration is left alone", () => {
		expectTypeOf<State<StringShape<"one" | "two">>>().toEqualTypeOf<"one" | "two">();
	});

});
