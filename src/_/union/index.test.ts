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


import { describe, expect, it } from "vitest";
import { boolean } from "../boolean/index.js";
import { number } from "../number/index.js";
import { string } from "../string/index.js";
import { union } from "./index.js";


describe("union", () => {

	it("returns a shape with kind 'union'", async () => {

		expect(union(string(), number()).kind).toBe("union");

	});

	it("retains the branches in the order they were stated", async () => {

		const text = string();
		const count = number();

		expect(union(text, count).branches).toEqual([text, count]);

	});

	it("keeps a deferred branch deferred", async () => {

		const text = string();
		const deferred = () => text;

		expect(union(deferred).branches).toEqual([deferred]);

	});

	it("accepts a single branch", async () => {

		expect(union(string()).branches).toHaveLength(1);

	});

	it("flattens a nested union into its own branches", async () => {

		const text = string();
		const count = number();
		const flag = boolean();

		expect(union(text, union(count, flag)).branches).toEqual([text, count, flag]);

	});

	it("flattens a nested union at any depth", async () => {

		const text = string();
		const count = number();
		const flag = boolean();

		expect(union(union(text, union(count)), flag).branches).toEqual([text, count, flag]);

	});

	it("leaves a deferred nested union deferred", async () => {

		const nested = () => union(number(), boolean());
		const text = string();

		expect(union(text, nested).branches).toEqual([text, nested]);

	});

	it("returns an immutable shape", async () => {

		const shape = union(string(), number());

		expect(() => Object.assign(shape, { kind: "string" })).toThrow();

	});

	it("includes only the kind and branches entries", async () => {

		expect(Object.keys(union(string())).sort()).toEqual(["branches", "kind"]);

	});

});
