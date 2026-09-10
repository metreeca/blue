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
	multiple,
	optional,
	property,
	reference,
	type ReferenceShape,
	type ResourceShape,
	nonempty,
	required,
	resource,
	type State,
	type StringShape,
	string,
	type Type,
	type as typed
} from "./_.js";


type LabelShape={

	readonly kind: "resource",
	readonly extends: [],

	readonly members: {
		readonly label: Property<StringShape, 1, 1>
	}

}

type LabelState={ readonly label: string }


describe("State", () => {

	describe("scalar shapes", () => {

		test("BooleanShape → boolean", () => {
			expectTypeOf<State<BooleanShape>>().toEqualTypeOf<boolean>();
		});

		test("NumberShape → number", () => {
			expectTypeOf<State<NumberShape>>().toEqualTypeOf<number>();
		});

		test("StringShape → string", () => {
			expectTypeOf<State<StringShape>>().toEqualTypeOf<string>();
		});

	});

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


describe("Content", () => {

	test("Id → its reference type", () => {
		expectTypeOf<Content<Id>>().toEqualTypeOf<Reference>();
	});

	test("Type → its optional reference type", () => {
		expectTypeOf<Content<Type>>().toEqualTypeOf<Optional<Reference>>();
	});

	test("Property → the state of its range", () => {
		expectTypeOf<Content<Property<StringShape, 1, 1>>>()
			.toEqualTypeOf<string>();
	});

	test("Property → the state of a lazy range", () => {
		expectTypeOf<Content<Property<() => StringShape, 1, 1>>>()
			.toEqualTypeOf<string>();
	});

	test("Property → an IRI for a reference range", () => {
		expectTypeOf<Content<Property<ReferenceShape, 1, 1>>>()
			.toEqualTypeOf<Reference>();
	});

	test("Property → the state of a resource range", () => {
		expectTypeOf<Content<Property<LabelShape, 1, 1>>>()
			.toEqualTypeOf<LabelState>();
	});

	test("Property → an optional value where at most one is admitted", () => {
		expectTypeOf<Content<Property<StringShape, undefined, 1>>>().toEqualTypeOf<undefined | string>();
	});

	test("Property → a non-empty array where at least one is required", () => {
		expectTypeOf<Content<Property<StringShape, 1, undefined>>>()
			.toEqualTypeOf<readonly [string, ...string[]]>();
	});

	test("Property → an optional array where any number is admitted", () => {
		expectTypeOf<Content<Property<StringShape, undefined, undefined>>>()
			.toEqualTypeOf<undefined | readonly string[]>();
	});

	test("Property → a non-empty array where the lower bound exceeds one", () => {
		expectTypeOf<Content<Property<StringShape, 2, 5>>>()
			.toEqualTypeOf<readonly [string, ...string[]]>();
	});

	test("Property → an optional array where the lower bound is zero", () => {
		expectTypeOf<Content<Property<StringShape, 0, 5>>>()
			.toEqualTypeOf<undefined | readonly string[]>();
	});

	test("Property → a bare value where at most one is admitted above a lower bound", () => {
		expectTypeOf<Content<Property<StringShape, 1, 1>>>().toEqualTypeOf<string>();
	});

	test("Property → an optional array where the bounds are not literal", () => {
		expectTypeOf<Content<Property<StringShape, number, number>>>()
			.toEqualTypeOf<undefined | readonly string[]>();
	});

	test("distributes over a member union", () => {
		expectTypeOf<Content<Id | Property<StringShape, 1, 1>>>()
			.toEqualTypeOf<Reference | string>();
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
			readonly label: Property<StringShape, 1, 1>
		}>>().toEqualTypeOf<{
			readonly id: Reference,
			readonly type: Optional<Reference>,
			readonly label: string
		}>();
	});

	test("preserves member keys", () => {
		expectTypeOf<keyof Instance<{
			readonly id: Id,
			readonly label: Property<StringShape, 1, 1>
		}>>().toEqualTypeOf<"id" | "label">();
	});

	test("satisfies the resource contract", () => {
		expectTypeOf<Instance<{
			readonly label: Property<StringShape, 1, 1>
		}>>().toExtend<Resource>();
	});

});


describe("Inheritance", () => {

	test("no shapes → an unconstrained state", () => {
		expectTypeOf<Inheritance<[]>>().toEqualTypeOf<unknown>();
	});

	test("single shape → its state", () => {
		expectTypeOf<Inheritance<[LabelShape]>>().toEqualTypeOf<LabelState>();
	});

	test("multiple shapes → the intersection of their states", () => {
		expectTypeOf<Inheritance<[
			{ readonly kind: "resource", readonly extends: [], readonly members: { readonly id: Id } },
			LabelShape
		]>>().toEqualTypeOf<{ readonly id: Reference } & LabelState>();
	});

	test("lazy shape → the state of the shape it returns", () => {
		expectTypeOf<Inheritance<[() => LabelShape]>>().toEqualTypeOf<LabelState>();
	});

});


describe("resource", () => {

	test("infers the instance type from its members", () => {
		const shape=resource({ id: id(), type: typed(), label: required(string()) });

		expectTypeOf<State<typeof shape>>().toEqualTypeOf<{
			readonly id: Reference,
			readonly type: Optional<Reference>,
			readonly label: string
		}>();
	});

	test("empty members → empty instance", () => {
		const shape=resource({});

		expectTypeOf<State<typeof shape>>().toEqualTypeOf<{}>();
	});

	test("rejects a non-member value", () => {
		// @ts-expect-error - a shape is not a member
		resource({ label: string() });
	});


	test("merges the state of an extended shape into the instance", () => {
		const shape=resource(resource({ id: id() }), { label: required(string()) });

		expectTypeOf<State<typeof shape>>().toEqualTypeOf<{ readonly id: Reference } & LabelState>();
	});

	test("merges the state of every extended shape", () => {
		const shape=resource(
			resource({ id: id() }),
			resource({ type: typed() }),
			{ label: required(string()) }
		);

		expectTypeOf<State<typeof shape>>()
			.toEqualTypeOf<{ readonly id: Reference } & { readonly type: Optional<Reference> } & LabelState>();
	});

	test("resolves a lazy extended shape", () => {
		const base=resource({ id: id() });
		const shape=resource(() => base, { label: required(string()) });

		expectTypeOf<State<typeof shape>>().toEqualTypeOf<{ readonly id: Reference } & LabelState>();
	});

	test("accepts constraints after the members", () => {
		const shape=resource(resource({ id: id() }), { label: required(string()) }, {});

		expectTypeOf<State<typeof shape>>().toEqualTypeOf<{ readonly id: Reference } & LabelState>();
	});

	test("resolves a lazy property range", () => {
		const shape=resource({ label: required(() => string()) });

		expectTypeOf<State<typeof shape>>().toEqualTypeOf<LabelState>();
	});

	test("links mutually recursive shapes through lazy ranges", () => {

		// the value cycle blocks inference, so each shape states its own type; the state stays derived

		type LeftShape={
			readonly kind: "resource",
			readonly extends: [],
			readonly members: { readonly right: Property<() => RightShape, 1, 1> }
		}

		type RightShape={
			readonly kind: "resource",
			readonly extends: [],
			readonly members: { readonly left: Property<() => LeftShape, 1, 1> }
		}

		const left: LeftShape=resource({ right: required(() => right) });
		const right: RightShape=resource({ left: required(() => left) });

		expectTypeOf<State<typeof left>["right"]["left"]["right"]>().toEqualTypeOf<State<typeof right>>();

	});

	test("a reference range keeps the target out of the state", () => {

		function left() {
			return resource({ id: id(), right: required(reference(right)) });
		}

		function right() {
			return resource({ id: id(), left: required(reference(left)) });
		}

		expectTypeOf<State<ReturnType<typeof left>>>().toEqualTypeOf<{
			readonly id: Reference,
			readonly right: Reference
		}>();

		expectTypeOf<State<ReturnType<typeof right>>>().toEqualTypeOf<{
			readonly id: Reference,
			readonly left: Reference
		}>();

	});

	test("links mutually recursive shapes without annotations", () => {

		// hoisted declarations let each shape name the other, so both return types are inferred

		function scheme() {
			return resource({ id: id(), hasTopConcept: required(reference(concept)) });
		}

		function concept() {
			return resource({ id: id(), inScheme: required(reference(scheme)) });
		}

		expectTypeOf<State<ReturnType<typeof scheme>>["hasTopConcept"]>().toEqualTypeOf<Reference>();
		expectTypeOf<State<ReturnType<typeof concept>>["inScheme"]>().toEqualTypeOf<Reference>();

	});

	test("rejects a non-shape as an extended shape", () => {
		// @ts-expect-error - a string shape is not a resource shape
		resource(string(), { label: required(string()) });
	});

	test("rejects an extended shape as the members", () => {
		// @ts-expect-error - a resource shape is not a member map
		resource(resource({ id: id() }));
	});

});


describe("shape factories", () => {

	test("boolean → BooleanShape", () => {
		expectTypeOf(boolean()).toEqualTypeOf<BooleanShape>();
	});

	test("number → NumberShape", () => {
		expectTypeOf(number()).toEqualTypeOf<NumberShape>();
	});

	test("string → StringShape", () => {
		expectTypeOf(string()).toEqualTypeOf<StringShape>();
	});

	test("id → Id", () => {
		expectTypeOf(id()).toEqualTypeOf<Id>();
	});

	test("type → Type", () => {
		expectTypeOf(typed()).toEqualTypeOf<Type>();
	});

	test("reference → ReferenceShape", () => {
		expectTypeOf(reference(resource({ id: id() }))).toEqualTypeOf<ReferenceShape>();
	});

	test("required → exactly one value", () => {
		expectTypeOf(required(string())).toEqualTypeOf<Property<StringShape, 1, 1>>();
	});

	test("optional → at most one value", () => {
		expectTypeOf(optional(string())).toEqualTypeOf<Property<StringShape, undefined, 1>>();
	});

	test("nonempty → at least one value", () => {
		expectTypeOf(nonempty(string())).toEqualTypeOf<Property<StringShape, 1, undefined>>();
	});

	test("multiple → any number of values", () => {
		expectTypeOf(multiple(string())).toEqualTypeOf<Property<StringShape, undefined, undefined>>();
	});

	test("the cardinality factories accept constraints", () => {
		expectTypeOf(required(string(), { hidden: true })).toEqualTypeOf<Property<StringShape, 1, 1>>();
	});

	test("property → the bounds it was given", () => {
		expectTypeOf(property(string(), { minCount: 2, maxCount: 5 }))
			.toEqualTypeOf<Property<StringShape, 2, 5>>();
	});

	test("property → unstated bounds where none are given", () => {
		expectTypeOf(property(string()))
			.toEqualTypeOf<Property<StringShape, undefined, undefined>>();
	});

	test("property → one bound where only one is given", () => {
		expectTypeOf(property(string(), { minCount: 1 }))
			.toEqualTypeOf<Property<StringShape, 1, undefined>>();
	});

	test("property → accepts constraints after the range", () => {
		expectTypeOf(property(string(), { hidden: true, forward: "https://example.org/label" }))
			.toEqualTypeOf<Property<StringShape, undefined, undefined>>();
	});

	test("property → rejects an unknown constraint", () => {
		// @ts-expect-error - nope is not a property constraint
		property(string(), { nope: true });
	});

	test("Property admits any shape as its range", () => {
		expectTypeOf<Property["range"]>().toEqualTypeOf<Parameters<typeof property>[0]>();
	});

});
