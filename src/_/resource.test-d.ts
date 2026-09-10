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
import { type Instance, type Proposal, type Range, type RangeCount, type Shape } from "./index.js";
import { number } from "./number.js";
import { reference, type ReferenceShape } from "./reference.js";
import {
	type Carried,
	type Content,
	type Id,
	id,
	type Retrieved,
	multiple,
	type Input,
	nonempty,
	optional,
	type Property,
	property,
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


describe("resource factories", () => {

	test("id → Id", () => {
		expectTypeOf(id()).toEqualTypeOf<Id>();
	});

	test("type → Type", () => {
		expectTypeOf(typed()).toEqualTypeOf<Type>();
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
		expectTypeOf(required(string(), { hidden: true }))
			.toEqualTypeOf<{ readonly hidden: true } & Property<StringShape, 1, 1>>();
	});

	test("property → the bounds it was given", () => {
		expectTypeOf(property(string(), { minCount: 2, maxCount: 5 }))
			.toEqualTypeOf<{ readonly minCount: 2, readonly maxCount: 5 } & Property<StringShape, 2, 5>>();
	});

	test("property → unstated bounds where none are given", () => {
		expectTypeOf(property(string()))
			.toEqualTypeOf<Property<StringShape, undefined, undefined>>();
	});

	test("property → one bound where only one is given", () => {
		expectTypeOf(property(string(), { minCount: 1 }))
			.toEqualTypeOf<{ readonly minCount: 1 } & Property<StringShape, 1, undefined>>();
	});

	test("property → accepts constraints after the range", () => {
		expectTypeOf(property(string(), { hidden: true, forward: "https://example.org/label" }))
			.toEqualTypeOf<{ readonly hidden: true, readonly forward: "https://example.org/label" } & Property<StringShape, undefined, undefined>>();
	});

	test("property → rejects an unknown constraint", () => {
		// @ts-expect-error - nope is not a property constraint
		property(string(), { nope: true });
	});

	test("Property admits any shape as its range", () => {
		expectTypeOf<Property["range"]>().toEqualTypeOf<Parameters<typeof property>[0]>();
	});

	test("Property states the values it admits as a range", () => {
		expectTypeOf<Property<StringShape, 1, 1>>().toExtend<Range<StringShape, 1, 1>>();
		expectTypeOf<Property<StringShape, undefined, undefined>>()
			.toExtend<Range<StringShape, undefined, undefined>>();
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

	type Captive<R extends Lazy<Shape>, L extends RangeCount, U extends RangeCount>=
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
			.toEqualTypeOf<Reference | Proposal<LabelShape>>();
	});

	test("Property → inline proposals at every cardinality", () => {
		expectTypeOf<Input<Captive<ReferenceShape<LabelShape>, undefined, undefined>>>()
			.toEqualTypeOf<undefined | readonly (Reference | Proposal<LabelShape>)[]>();
	});

	test("Property → the state of a captive range that points at nothing", () => {
		expectTypeOf<Input<Captive<StringShape, 1, 1>>>().toEqualTypeOf<string>();
	});

	test("distributes over a member union", () => {
		expectTypeOf<Input<Id | Property<StringShape, 1, 1>>>()
			.toEqualTypeOf<Reference | string>();
	});

});

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

describe("inheritance", () => {

	test("accumulates a chain of extended shapes", () => {

		const top=resource({ top: required(string()) });
		const middle=resource(top, { middle: required(string()) });
		const bottom=resource(middle, { bottom: required(string()) });

		expectTypeOf<Instance<typeof bottom>>().toEqualTypeOf<{
			readonly top: string,
			readonly middle: string,
			readonly bottom: string
		}>();

	});

	test("admits a shape reached along two paths", () => {

		const apex=resource({ apex: required(string()) });
		const left=resource(apex, { left: required(string()) });
		const right=resource(apex, { right: required(string()) });
		const base=resource(left, right, {});

		expectTypeOf<Instance<typeof base>["apex"]>().toEqualTypeOf<string>();
		expectTypeOf<Instance<typeof base>["left"]>().toEqualTypeOf<string>();
		expectTypeOf<Instance<typeof base>["right"]>().toEqualTypeOf<string>();

	});

	test("admits the same shape extended twice", () => {

		const parent=resource({ shared: required(string()) });
		const child=resource(parent, parent, {});

		expectTypeOf<Instance<typeof child>["shared"]>().toEqualTypeOf<string>();

	});

	test("admits a member two parents agree on", () => {

		const left=resource({ shared: required(string()) });
		const right=resource({ shared: required(string()) });
		const child=resource(left, right, {});

		expectTypeOf<Instance<typeof child>["shared"]>().toEqualTypeOf<string>();

	});

	test("voids a member two parents give different cardinalities", () => {

		const left=resource({ shared: required(string()) });
		const right=resource({ shared: optional(string()) });
		const child=resource(left, right, {});

		expectTypeOf<Instance<typeof child>["shared"]>().toBeNever();

	});

	test("voids a member two parents give incompatible ranges", () => {

		const left=resource({ shared: required(string()) });
		const right=resource({ shared: required(number()) });
		const child=resource(left, right, {});

		expectTypeOf<Instance<typeof child>["shared"]>().toBeNever();

	});

	test("narrows a member the child redeclares", () => {

		const parent=resource({ shared: optional(string()) });
		const child=resource(parent, { shared: required(string()) });

		expectTypeOf<Instance<typeof child>["shared"]>().toEqualTypeOf<string>();

	});

	test("carries a member an extending shape narrows down to the ones extending it", () => {

		const top=resource({ shared: optional(string()) });
		const middle=resource(top, { shared: required(string()) });
		const bottom=resource(middle, {});

		expectTypeOf<Instance<typeof bottom>["shared"]>().toEqualTypeOf<string>();

	});

	test("voids an upper bound the child tightens across arity", () => {

		const parent=resource({ shared: multiple(string()) });
		const child=resource(parent, { shared: required(string()) });

		expectTypeOf<Instance<typeof child>["shared"]>().toBeNever();

	});

	test("admits a lower bound the child raises within a scalar arity", () => {

		const parent=resource({ shared: optional(string()) });
		const child=resource(parent, { shared: required(string()) });

		expectTypeOf<Instance<typeof child>["shared"]>().toEqualTypeOf<string>();

	});

	test("admits a lower bound the child raises", () => {

		const parent=resource({ shared: multiple(string()) });
		const child=resource(parent, { shared: nonempty(string()) });

		expectTypeOf<Instance<typeof child>["shared"]>().toEqualTypeOf<readonly [string, ...string[]]>();

	});

	test("voids a member the child relaxes", () => {

		const parent=resource({ shared: required(string()) });
		const child=resource(parent, { shared: optional(string()) });

		expectTypeOf<Instance<typeof child>["shared"]>().toBeNever();

	});

	test("voids a member the child retypes", () => {

		const parent=resource({ shared: required(string()) });
		const child=resource(parent, { shared: required(number()) });

		expectTypeOf<Instance<typeof child>["shared"]>().toBeNever();

	});

	test("voids a cardinality the child widens", () => {

		const parent=resource({ shared: required(string()) });
		const child=resource(parent, { shared: multiple(string()) });

		expectTypeOf<Instance<typeof child>["shared"]>().toBeNever();

	});

	test("voids a range the child swaps for another kind", () => {

		const target=resource({ id: id() });
		const parent=resource({ shared: required(string()) });
		const child=resource(parent, { shared: required(reference(target)) });

		expectTypeOf<Instance<typeof child>["shared"]>().toBeNever();

	});

	test("voids a member kind the child swaps", () => {

		const parent=resource({ shared: required(string()) });
		const child=resource(parent, { shared: id() });

		expectTypeOf<Instance<typeof child>["shared"]>().toBeNever();

	});

	test("voids a grandparent constraint an extending shape relaxes", () => {

		const first=resource({ shared: required(string()) });
		const second=resource({ other: optional(string()) });

		const middle=resource(first, second, {});
		const bottom=resource(middle, { shared: optional(string()) });

		expectTypeOf<Instance<typeof bottom>["shared"]>().toBeNever();

	});

	test("admits a member the child redeclares identically", () => {

		const parent=resource({ shared: required(string()) });
		const child=resource(parent, { shared: required(string()) });

		expectTypeOf<Instance<typeof child>["shared"]>().toEqualTypeOf<string>();

	});

	test("admits a member the child adds", () => {

		const parent=resource({ inherited: required(string()) });
		const child=resource(parent, { own: optional(string()) });

		expectTypeOf<Instance<typeof child>["own"]>().toEqualTypeOf<undefined | string>();

	});

	test("rejects a cycle among extended shapes", () => {

		// the shapes themselves are accepted; the cycle surfaces where the state is resolved

		function alpha() {
			return resource(beta, { alpha: required(string()) });
		}

		function beta() {
			return resource(alpha, { beta: required(string()) });
		}

		// @ts-expect-error - inheritance cycles resolve indefinitely
		expectTypeOf<Instance<ReturnType<typeof alpha>>>().toBeObject();

		expectTypeOf(alpha).toBeFunction();
		expectTypeOf(beta).toBeFunction();

	});

	test("resolves eager and lazy parents alike", () => {

		const eager=resource({ eager: required(string()) });

		function lazy() {
			return resource({ lazy: required(string()) });
		}

		const child=resource(eager, lazy, { own: required(string()) });

		expectTypeOf<Instance<typeof child>>().toEqualTypeOf<{
			readonly eager: string,
			readonly lazy: string,
			readonly own: string
		}>();

	});

});

describe("resource", () => {

	test("infers the instance type from its members", () => {
		const shape=resource({ id: id(), type: typed(), label: required(string()) });

		expectTypeOf<Instance<typeof shape>>().toEqualTypeOf<{
			readonly id: Reference,
			readonly type?: Reference,
			readonly label: string
		}>();
	});

	test("empty members → empty instance", () => {
		const shape=resource({});

		expectTypeOf<Instance<typeof shape>>().toEqualTypeOf<{}>();
	});

	test("rejects a non-member value", () => {
		// @ts-expect-error - a shape is not a member
		resource({ label: string() });
	});


	test("merges the state of an extended shape into the instance", () => {
		const shape=resource(resource({ id: id() }), { label: required(string()) });

		expectTypeOf<Instance<typeof shape>>().toEqualTypeOf<{ readonly id: Reference, readonly label: string }>();
	});

	test("merges the state of every extended shape", () => {
		const shape=resource(
			resource({ id: id() }),
			resource({ type: typed() }),
			{ label: required(string()) }
		);

		expectTypeOf<Instance<typeof shape>>().toEqualTypeOf<{
			readonly id: Reference,
			readonly type?: Reference,
			readonly label: string
		}>();
	});

	test("resolves a lazy extended shape", () => {
		const base=resource({ id: id() });
		const shape=resource(() => base, { label: required(string()) });

		expectTypeOf<Instance<typeof shape>>().toEqualTypeOf<{ readonly id: Reference, readonly label: string }>();
	});

	test("accepts constraints after the members", () => {
		const shape=resource(resource({ id: id() }), { label: required(string()) }, {});

		expectTypeOf<Instance<typeof shape>>().toEqualTypeOf<{ readonly id: Reference, readonly label: string }>();
	});

	test("resolves a lazy property range", () => {
		const shape=resource({ label: required(() => string()) });

		expectTypeOf<Instance<typeof shape>>().toEqualTypeOf<LabelState>();
	});

	test("links mutually recursive shapes through lazy ranges", () => {

		// the value cycle blocks inference, so each shape states its own type; the state stays derived

		type LeftShape={
			readonly kind: "resource",
			readonly parents: [],
			readonly members: { readonly right: Property<() => RightShape, 1, 1> }
		}

		type RightShape={
			readonly kind: "resource",
			readonly parents: [],
			readonly members: { readonly left: Property<() => LeftShape, 1, 1> }
		}

		const left: LeftShape=resource({ right: required(() => right) });
		const right: RightShape=resource({ left: required(() => left) });

		expectTypeOf<Instance<typeof left>["right"]["left"]["right"]>().toEqualTypeOf<Instance<typeof right>>();

	});

	test("a reference range keeps the target out of the state", () => {

		function left() {
			return resource({ id: id(), right: required(reference(right)) });
		}

		function right() {
			return resource({ id: id(), left: required(reference(left)) });
		}

		expectTypeOf<Instance<ReturnType<typeof left>>>().toEqualTypeOf<{
			readonly id: Reference,
			readonly right: Reference
		}>();

		expectTypeOf<Instance<ReturnType<typeof right>>>().toEqualTypeOf<{
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

		expectTypeOf<Instance<ReturnType<typeof scheme>>["hasTopConcept"]>().toEqualTypeOf<Reference>();
		expectTypeOf<Instance<ReturnType<typeof concept>>["inScheme"]>().toEqualTypeOf<Reference>();

	});

	test("links a shape referenced by the very shape it extends", () => {

		// the loop runs through inheritance one way and through a reference the other

		function outer() {
			return resource(inner, { own: required(string()) });
		}

		function inner() {
			return resource({ id: id(), back: required(reference(outer)) });
		}

		expectTypeOf<Instance<ReturnType<typeof outer>>>().toEqualTypeOf<{
			readonly id: Reference,
			readonly back: Reference,
			readonly own: string
		}>();

	});

	test("resolves such a loop whichever end is declared first", () => {

		// the same loop with the referring shape declared first

		function referring() {
			return resource({ id: id(), back: required(reference(extending)) });
		}

		function extending() {
			return resource(referring, { own: required(string()) });
		}

		expectTypeOf<Instance<ReturnType<typeof extending>>>().toEqualTypeOf<{
			readonly id: Reference,
			readonly back: Reference,
			readonly own: string
		}>();

	});

	test("keeps a reference out of the state on both sides of a loop", () => {

		function left() {
			return resource({ id: id(), right: required(reference(right)) });
		}

		function right() {
			return resource({ id: id(), left: required(reference(left)) });
		}

		expectTypeOf<Instance<ReturnType<typeof left>>["right"]>()
			.not.toEqualTypeOf<Instance<ReturnType<typeof right>>>();

		expectTypeOf<Instance<ReturnType<typeof right>>["left"]>()
			.not.toEqualTypeOf<Instance<ReturnType<typeof left>>>();

	});

	test("carries a constraint from a grandparent reached through one of two parents", () => {

		const first=resource({ shared: optional(string()) });
		const second=resource({ other: optional(string()) });

		const middle=resource(first, second, {});

		const bottom=resource(middle, { shared: required(string()) });

		expectTypeOf<Instance<typeof bottom>["shared"]>().toEqualTypeOf<string>();
		expectTypeOf<Instance<typeof bottom>["other"]>().toEqualTypeOf<undefined | string>();

	});

	test("admits an inherited reference repointed at a refining shape", () => {

		const target=resource({ id: id() });
		const refining=resource(target, { extra: required(string()) });

		const parent=resource({ link: required(reference(target)) });
		const child=resource(parent, { link: required(reference(refining)) });

		expectTypeOf<Instance<typeof child>["link"]>().toEqualTypeOf<Reference>();

	});

	test("carries the cardinality of every member into the state", () => {

		function target() {
			return resource({ id: id() });
		}

		const shape=resource({

			one: required(string()),
			zeroOrOne: optional(string()),
			oneOrMore: nonempty(string()),
			zeroOrMore: multiple(string()),

			exotic: property(string(), { minCount: 2, maxCount: 5 }),
			loose: property(string(), { minCount: 0 }),
			bare: property(string()),

			link: required(reference(target)),
			links: multiple(reference(target))

		});

		expectTypeOf<Instance<typeof shape>>().toEqualTypeOf<{

			readonly one: string,
			readonly zeroOrOne?: string,
			readonly oneOrMore: readonly [string, ...string[]],
			readonly zeroOrMore?: readonly string[],

			readonly exotic: readonly [string, ...string[]],
			readonly loose?: readonly string[],
			readonly bare?: readonly string[],

			readonly link: Reference,
			readonly links?: readonly Reference[]

		}>();

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
