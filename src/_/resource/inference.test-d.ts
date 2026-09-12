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
import type { Reference, Resource } from "@metreeca/qest/resource";
import { describe, expectTypeOf, test } from "vitest";
import { type Compound, type Shape } from "../value/index.js";
import { type ReferenceShape } from "../reference/index.js";
import { type StringShape } from "../string/index.js";
import { type Id, type Property, type ResourceShape, type Type } from "./index.js";
import { type Arity, type Carried, type Content, type Input, type Retrieved, type Skippable } from "./inference.js";


type LabelShape={

	readonly kind: "resource",
	readonly classes: readonly Reference[],
	readonly parents: [],

	readonly members: {
		readonly label: Property<StringShape, 1, 1>
	}

}

type LabelState={ readonly label: string }


describe("inheritance", () => {

	describe("Carried", () => {

		type NamedShape={

			readonly kind: "resource",
			readonly classes: readonly Reference[],
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

});

describe("members", () => {

	describe("Retrieved", () => {

		test("empty members → empty record", () => {
			expectTypeOf<Retrieved<ResourceShape<[], {}>>>().toEqualTypeOf<{}>();
		});

		test("maps each member to its content", () => {
			expectTypeOf<Retrieved<ResourceShape<[], {
				readonly id: Id,
				readonly type: Type,
				readonly label: Property<StringShape, 1, 1>
			}>>>().toEqualTypeOf<{
				readonly id: Reference,
				readonly type?: Reference,
				readonly label: string
			}>();
		});

		test("leaves a member optional where it may be left out", () => {
			expectTypeOf<Retrieved<ResourceShape<[], {
				readonly type: Type,
				readonly one: Property<StringShape, 1, 1>,
				readonly zeroOrOne: Property<StringShape, undefined, 1>,
				readonly oneOrMore: Property<StringShape, 1, undefined>,
				readonly zeroOrMore: Property<StringShape, undefined, undefined>
			}>>>().toEqualTypeOf<{
				readonly type?: Reference,
				readonly one: string,
				readonly zeroOrOne?: string,
				readonly oneOrMore: readonly [string, ...string[]],
				readonly zeroOrMore?: readonly string[]
			}>();
		});

		test("preserves member keys", () => {
			expectTypeOf<keyof Retrieved<ResourceShape<[], {
				readonly id: Id,
				readonly label: Property<StringShape, 1, 1>
			}>>>().toEqualTypeOf<"id" | "label">();
		});

		test("satisfies the resource contract", () => {
			expectTypeOf<Retrieved<ResourceShape<[], {
				readonly label: Property<StringShape, 1, 1>
			}>>>().toExtend<Resource>();
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

	describe("Input", () => {

		type Captive<R extends Lazy<Shape>, L extends Optional<number>, U extends Optional<number>> =
			Property<R, L, U> & { readonly captive: true }

		test("Id → its reference type", () => {
			expectTypeOf<Input<Id>>().toEqualTypeOf<Reference>();
		});

		test("Type → its optional reference type", () => {
			expectTypeOf<Input<Type>>().toEqualTypeOf<Optional<Reference>>();
		});

		test("Property → the state of its range, as the retrieved value does", () => {
			expectTypeOf<Input<Property<StringShape, 1, 1>>>()
				.toEqualTypeOf<Content<Property<StringShape, 1, 1>>>();
		});

		test("Property → an IRI for a reference range the submitter does not hold captive", () => {
			expectTypeOf<Input<Property<ReferenceShape<LabelShape>, 1, 1>>>()
				.toEqualTypeOf<Reference>();
		});

		test("Property → an IRI or an inline proposal for a captive reference range", () => {
			expectTypeOf<Input<Captive<ReferenceShape<LabelShape>, 1, 1>>>()
				.toEqualTypeOf<Reference | Compound<LabelShape>>();
		});

		test("Property → inline proposals at every cardinality", () => {
			expectTypeOf<Input<Captive<ReferenceShape<LabelShape>, undefined, undefined>>>()
				.toEqualTypeOf<undefined | readonly (Reference | Compound<LabelShape>)[]>();
		});

		test("Property → the state of a captive range that points at nothing", () => {
			expectTypeOf<Input<Captive<StringShape, 1, 1>>>().toEqualTypeOf<string>();
		});

		test("distributes over a member union", () => {
			expectTypeOf<Input<Id | Property<StringShape, 1, 1>>>()
				.toEqualTypeOf<Reference | string>();
		});

	});

});

describe("cardinality", () => {

	describe("Arity", () => {

		test("a bare value where exactly one is required", () => {
			expectTypeOf<Arity<string, 1, 1>>().toEqualTypeOf<string>();
		});

		test("an optional value where at most one is admitted", () => {
			expectTypeOf<Arity<string, undefined, 1>>().toEqualTypeOf<undefined | string>();
		});

		test("a non-empty array where at least one is required", () => {
			expectTypeOf<Arity<string, 1, undefined>>().toEqualTypeOf<readonly [string, ...string[]]>();
		});

		test("an optional array where any number is admitted", () => {
			expectTypeOf<Arity<string, undefined, undefined>>().toEqualTypeOf<undefined | readonly string[]>();
		});

		test("a non-empty array where the lower bound exceeds one", () => {
			expectTypeOf<Arity<string, 2, 5>>().toEqualTypeOf<readonly [string, ...string[]]>();
		});

		test("an optional array where the lower bound is zero", () => {
			expectTypeOf<Arity<string, 0, 5>>().toEqualTypeOf<undefined | readonly string[]>();
		});

		test("an optional array where the bounds are not literal", () => {
			expectTypeOf<Arity<string, number, number>>().toEqualTypeOf<undefined | readonly string[]>();
		});

		test("an optional value where at most one is admitted and the lower bound is zero", () => {
			expectTypeOf<Arity<string, 0, 1>>().toEqualTypeOf<undefined | string>();
		});

		test("an optional value where at most one is admitted and the lower bound is not literal", () => {
			expectTypeOf<Arity<string, number, 1>>().toEqualTypeOf<undefined | string>();
		});

		test("an optional array where the bounds are left unconstrained", () => {
			expectTypeOf<Arity<string, Optional<number>, Optional<number>>>()
				.toEqualTypeOf<undefined | readonly string[]>();
		});

		test("the value as it stands, whatever it is drawn from", () => {
			expectTypeOf<Arity<string | number, 1, 1>>().toEqualTypeOf<string | number>();
		});

	});

	describe("Skippable", () => {

		test("a stated lower bound requires a value", () => {
			expectTypeOf<Skippable<1>>().toEqualTypeOf<false>();
			expectTypeOf<Skippable<2>>().toEqualTypeOf<false>();
		});

		test("an unstated or zero lower bound admits absence", () => {
			expectTypeOf<Skippable<undefined>>().toEqualTypeOf<true>();
			expectTypeOf<Skippable<0>>().toEqualTypeOf<true>();
		});

		test("a bound stated only as a number admits absence", () => {
			expectTypeOf<Skippable<number>>().toEqualTypeOf<true>();
		});

		test("a bound left unconstrained admits absence", () => {
			expectTypeOf<Skippable<Optional<number>>>().toEqualTypeOf<true>();
		});

		test("a bound admitting absence among other values admits absence", () => {
			expectTypeOf<Skippable<0 | 1>>().toEqualTypeOf<true>();
			expectTypeOf<Skippable<1 | undefined>>().toEqualTypeOf<true>();
		});

		test("a bound admitting nothing at all requires a value", () => {
			expectTypeOf<Skippable<never>>().toEqualTypeOf<false>();
		});

	});

});
