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
import { reference } from "../reference/index.js";
import { type Parents, resource, type ResourceConstraints, type ResourceShape } from "../resource/index.js";
import { string } from "../string/index.js";
import { getBoundBranch, getModelBranches, getShapeBranches, getStateBranch } from "./accessors.js";
import { union } from "./index.js";



/**
 * Builds a resource shape without the resource() factory, keeping the suite to the union module alone.
 */
function target(constraints: ResourceConstraints = {}, ...parents: Parents): ResourceShape {
	return resource(...parents, {}, constraints);
}

describe("getShapeBranches", () => {

	it("flattens a union to its branches", async () => {

		const text = string();
		const count = number();

		expect(getShapeBranches(union(text, count))).toEqual([text, count]);

	});

	it("takes a plain shape to the single branch it is", async () => {

		const text = string();

		expect(getShapeBranches(text)).toEqual([text]);

	});

	it("resolves a deferred range", async () => {

		const text = string();

		expect(getShapeBranches(() => text)).toEqual([text]);

	});

	it("resolves a deferred branch", async () => {

		const text = string();

		expect(getShapeBranches(union(() => text))).toEqual([text]);

	});

	it("flattens a nested union into the enclosing one", async () => {

		const text = string();
		const count = number();
		const flag = boolean();

		expect(getShapeBranches(union(text, union(count, flag)))).toEqual([text, count, flag]);

	});

});

describe("getStateBranch", () => {

	const branches = [string(), number()];

	it("picks the branch a value belongs to", async () => {

		expect(getStateBranch("hello", branches)).toBe(branches[0]);
		expect(getStateBranch(42, branches)).toBe(branches[1]);

	});

	it("picks nothing for a value belonging to no branch", async () => {

		expect(getStateBranch(true, branches)).toBeUndefined();

	});

	it("picks nothing for a value belonging to several branches", async () => {

		expect(getStateBranch("hello", [string({ minLength: 1 }), string({ maxLength: 9 })])).toBeUndefined();

	});

	it("holds a value to every constraint of the branch", async () => {

		expect(getStateBranch(8, [number({ minInclusive: 1, maxInclusive: 5 })])).toBeUndefined();

	});

});

describe("getBoundBranch", () => {

	it("picks the branch a bound filters against", async () => {

		const branches = [number(), string()];

		expect(getBoundBranch(42, branches)).toBe(branches[0]);

	});

	it("picks a branch for a bound outside its value domain", async () => {

		const branches = [number({ minInclusive: 1, maxInclusive: 5 })];

		expect(getBoundBranch(8, branches)).toBe(branches[0]);

	});

	it("picks nothing for a bound filtering no branch", async () => {

		expect(getBoundBranch(true, [number(), string()])).toBeUndefined();

	});

	it("picks nothing for a bound filtering several branches", async () => {

		expect(getBoundBranch("hello", [string(), string()])).toBeUndefined();

	});

});

describe("getModelBranches", () => {

	it("picks every branch a placeholder fits", async () => {

		const branches = [string({ minLength: 1 }), string({ maxLength: 9 })];

		expect(getModelBranches("", branches)).toEqual(branches);

	});

	it("picks the single branch a placeholder of that type fits", async () => {

		const branches = [string(), number()];

		expect(getModelBranches(42, branches)).toEqual([branches[1]]);

	});

	it("picks nothing for a placeholder fitting no branch", async () => {

		expect(getModelBranches(true, [string(), number()])).toBeUndefined();

	});

	it("fits a reference branch by its identifier", async () => {

		const branches = [reference(target()), string()];

		expect(getModelBranches("app:/vendors/1", branches)).toEqual(branches);

	});

});
