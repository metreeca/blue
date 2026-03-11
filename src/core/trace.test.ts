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
import { collect, every, group, normalise } from "./trace.js";


describe("collect", () => {

	it("returns undefined when all entries are undefined", async () => {

		expect(collect({ minLength: undefined, maxLength: undefined })).toBeUndefined();

	});

	it("returns undefined for empty entries", async () => {

		expect(collect({})).toBeUndefined();

	});

	it("filters out undefined entries", async () => {

		const result = collect({ minLength: "too short", maxLength: undefined });

		expect(result).toEqual({ minLength: "too short" });

	});

	it("preserves all failed entries", async () => {

		const result = collect({ minLength: "too short", pattern: "no match" });

		expect(result).toEqual({ minLength: "too short", pattern: "no match" });

	});

	it("filters out empty string entries", async () => {

		expect(collect({ minLength: "" })).toBeUndefined();

	});

	it("filters out empty object entries", async () => {

		expect(collect({ minLength: {} })).toBeUndefined();

	});

	it("preserves nested trace entries", async () => {

		const result = collect({ name: { minLength: "too short" } });

		expect(result).toEqual({ name: { minLength: "too short" } });

	});

});

describe("every", () => {

	it("returns undefined when all values pass", async () => {

		expect(every([1, 2, 3], () => true)).toBeUndefined();

	});

	it("returns undefined when validator returns undefined", async () => {

		expect(every([1, 2, 3], () => undefined)).toBeUndefined();

	});

	it("returns violation message for single failing value", async () => {

		const result = every(["ab"], () => "too short");

		expect(result).toBe("too short");

	});

	it("returns message without count prefix for single value", async () => {

		const result = every(["ab"], () => "too short");

		expect(typeof result === "string" && !result.startsWith("(")).toBeTruthy();

	});

	it("returns message with count prefix for multiple failing values", async () => {

		const result = every(["a", "b", "c"], () => "too short");

		expect(result).toMatch(/^\(3\/3\)/);

	});

	it("counts only failing values in prefix", async () => {

		const result = every(
			["ab", "hello", "c"],
			v => v.length >= 3 || "too short"
		);

		expect(result).toMatch(/^\(2\/3\)/);

	});

	it("returns undefined for empty values array", async () => {

		expect(every([], () => "error")).toBeUndefined();

	});

	it("normalises true results from validator", async () => {

		const result = every([1, 2], v => v > 0 || "must be positive");

		expect(result).toBeUndefined();

	});

	it("returns keyed trace directly for single failing value", async () => {

		const keyed = { name: "required" };

		const result = every([1], () => keyed);

		expect(result).toEqual(keyed);

	});

	it("wraps single keyed failure in index key for multi-element array", async () => {

		const keyed = { name: "required" };

		const result = every([1, 2], v => v === 1 ? keyed : undefined);

		expect(result).toEqual({ "0": keyed });

	});

	it("wraps multiple keyed failures in index keys", async () => {

		const result = every([1, 2], () => ({ name: "required" }));

		expect(result).toEqual({
			"0": { name: "required" },
			"1": { name: "required" }
		});

	});

	it("wraps mixed failures in index keys when any is keyed", async () => {

		const result = every([1, 2, 3], v =>
			v === 1 ? "bad" : { name: "required" }
		);

		expect(result).toEqual({
			"0": "bad",
			"1": { name: "required" },
			"2": { name: "required" }
		});

	});

	it("applies count prefix when all failures are strings", async () => {

		const result = every(["a", "b", "c"], () => "too short");

		expect(result).toMatch(/^\(3\/3\) too short$/);

	});

	it("omits passing values from index-keyed trace", async () => {

		const result = every([1, 2, 3], v =>
			v === 2 ? undefined : { name: "required" }
		);

		expect(result).toEqual({
			"0": { name: "required" },
			"2": { name: "required" }
		});

	});

});

describe("group", () => {

	it("returns undefined when validator returns true", async () => {

		expect(group([1, 2, 3], () => true)).toBeUndefined();

	});

	it("returns undefined when validator returns undefined", async () => {

		expect(group([1, 2, 3], () => undefined)).toBeUndefined();

	});

	it("returns trace when validator returns string", async () => {

		expect(group([1, 2], () => "missing required value")).toBe("missing required value");

	});

	it("returns trace when validator returns keyed object", async () => {

		const result = group([1, 2], () => ({ hasValue: "missing 3" }));

		expect(result).toEqual({ hasValue: "missing 3" });

	});

	it("passes entire collection to validator", async () => {

		const result = group(
			["apple", "cherry"],
			vs => ["apple", "banana"].every(v => vs.includes(v)) || "missing banana"
		);

		expect(result).toBe("missing banana");

	});

	it("normalises empty string from validator to undefined", async () => {

		expect(group([1], () => "")).toBeUndefined();

	});

	it("normalises empty object from validator to undefined", async () => {

		expect(group([1], () => ({}))).toBeUndefined();

	});

});

describe("normalise", () => {

	it("returns undefined for undefined", async () => {

		expect(normalise(undefined)).toBeUndefined();

	});

	it("returns undefined for true", async () => {

		expect(normalise(true)).toBeUndefined();

	});

	it("returns undefined for empty string", async () => {

		expect(normalise("")).toBeUndefined();

	});

	it("returns undefined for empty object", async () => {

		expect(normalise({})).toBeUndefined();

	});

	it("passes through non-empty string", async () => {

		expect(normalise("error message")).toBe("error message");

	});

	it("passes through non-empty object", async () => {

		const result = normalise({ minLength: "too short" });

		expect(result).toEqual({ minLength: "too short" });

	});

	it("passes through nested trace object", async () => {

		const nested = { name: { minLength: "too short" } };

		expect(normalise(nested)).toEqual(nested);

	});

});
