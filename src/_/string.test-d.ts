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

import { describe, expectTypeOf, test } from "vitest";
import { type Instance, type Proposal } from "./_.js";
import { multiple, optional, required, resource } from "./resource.js";
import {
	date,
	duration,
	email,
	instant,
	iri,
	markdown,
	phone,
	type StringShape,
	string,
	tag,
	text,
	time,
	timestamp,
	url,
	year
} from "./string.js";


describe("string", () => {

	test("string → StringShape", () => {
		expectTypeOf(string()).toEqualTypeOf<StringShape>();
	});

	test("text → StringShape", () => {
		expectTypeOf(text()).toEqualTypeOf<StringShape>();
	});

	test("markdown → StringShape", () => {
		expectTypeOf(markdown()).toEqualTypeOf<StringShape>();
	});

	test("email → StringShape", () => {
		expectTypeOf(email()).toEqualTypeOf<StringShape>();
	});

	test("phone → StringShape", () => {
		expectTypeOf(phone()).toEqualTypeOf<StringShape>();
	});

	test("iri → StringShape", () => {
		expectTypeOf(iri()).toEqualTypeOf<StringShape>();
	});

	test("url → StringShape", () => {
		expectTypeOf(url()).toEqualTypeOf<StringShape>();
	});

	test("tag → StringShape", () => {
		expectTypeOf(tag()).toEqualTypeOf<StringShape>();
	});

	test("year → StringShape", () => {
		expectTypeOf(year()).toEqualTypeOf<StringShape>();
	});

	test("date → StringShape", () => {
		expectTypeOf(date()).toEqualTypeOf<StringShape>();
	});

	test("time → StringShape", () => {
		expectTypeOf(time()).toEqualTypeOf<StringShape>();
	});

	test("instant → StringShape", () => {
		expectTypeOf(instant()).toEqualTypeOf<StringShape>();
	});

	test("timestamp → StringShape", () => {
		expectTypeOf(timestamp()).toEqualTypeOf<StringShape>();
	});

	test("duration → StringShape", () => {
		expectTypeOf(duration()).toEqualTypeOf<StringShape>();
	});

	test("StringShape → string", () => {
		expectTypeOf<Instance<StringShape>>().toEqualTypeOf<string>();
	});

	test("enumerated StringShape → admitted values", () => {

		const shape=string({ in: ["active", "closed"] });

		expectTypeOf<Instance<typeof shape>>().toEqualTypeOf<"active" | "closed">();

	});

	test("enumerated shorthand → admitted values", () => {

		const shape=tag({ in: ["en", "it"] });

		expectTypeOf<Instance<typeof shape>>().toEqualTypeOf<"en" | "it">();

	});

	test("open StringShape → string", () => {

		const shape=string({ minLength: 1, pattern: /^\S+$/ });

		expectTypeOf<Instance<typeof shape>>().toEqualTypeOf<string>();

	});

	test("empty enumeration → string", () => {

		const shape=string({ in: [] });

		expectTypeOf<Instance<typeof shape>>().toEqualTypeOf<string>();

	});

	test("unenumerated values → string", () => {

		const values: readonly string[]=["active", "closed"];
		const shape=string({ in: values });

		expectTypeOf<Instance<typeof shape>>().toEqualTypeOf<string>();

	});

	test("stated values → admitted values", () => {

		const values: readonly ("active" | "closed")[]=["active", "closed"];
		const shape=string({ in: values });

		expectTypeOf<Instance<typeof shape>>().toEqualTypeOf<"active" | "closed">();

	});

	test("enumerated shape → open constraints", () => {

		const shape=string({ in: ["active", "closed"], minLength: 1 });

		expectTypeOf(shape.minLength).toEqualTypeOf<undefined | number>();

	});

	test("built shape → pattern source", () => {

		const shape=string({ pattern: /^\S+$/ });

		expectTypeOf(shape.pattern).toEqualTypeOf<undefined | string>();

	});

	test("refuses a narrowing claim outside the constraints", () => {

		// @ts-expect-error - the state is stated through the constraints, not on its own
		const shape=string<"active" | "closed">();

		expectTypeOf<Instance<typeof shape>>().toEqualTypeOf<string>();

	});

	test("refuses values the enumeration omits", () => {

		// @ts-expect-error - the stated enumeration doesn't admit the supplied values
		const shape=string<{ readonly in: readonly ["active", "closed"] }>({ in: ["active"] });

		expectTypeOf<Instance<typeof shape>>().toEqualTypeOf<"active" | "closed">();

	});

});

describe("members", () => {

	const Ticket=resource({
		title: required(text()),
		status: optional(string({ in: ["open", "closed"] })),
		labels: multiple(tag({ in: ["en", "it"] })),
		opened: optional(instant())
	});

	test("carries the admitted values through cardinality", () => {

		expectTypeOf<Instance<typeof Ticket>["title"]>().toEqualTypeOf<string>();
		expectTypeOf<Instance<typeof Ticket>["status"]>().toEqualTypeOf<undefined | "open" | "closed">();
		expectTypeOf<Instance<typeof Ticket>["labels"]>().toEqualTypeOf<undefined | readonly ("en" | "it")[]>();
		expectTypeOf<Instance<typeof Ticket>["opened"]>().toEqualTypeOf<undefined | string>();

	});

	test("carries the admitted values into a submission", () => {
		expectTypeOf<Proposal<typeof Ticket>["status"]>().toEqualTypeOf<undefined | "open" | "closed">();
	});

	test("carries the admitted values through inheritance", () => {

		const Open=resource(Ticket, { status: required(string({ in: ["open"] })) });

		expectTypeOf<Instance<typeof Open>["status"]>().toEqualTypeOf<"open">();

	});

});
