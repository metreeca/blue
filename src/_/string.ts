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

import { xsd } from "@metreeca/core/datatype";
import { string, type StringShape } from "../string.js";


export interface StringLengthConstraints {

	/**
	 * Minimum string length in characters.
	 *
	 * **Inheritance** — child value must be ≥ parent value, narrowing the lower bound.
	 *
	 * @defaultValue `undefined` (no minimum length)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#MinLengthConstraintComponent SHACL § 4.3.1 sh:minLength}
	 */
	readonly minLength?: number;

	/**
	 * Maximum string length in characters.
	 *
	 * **Inheritance** — child value must be ≤ parent value, narrowing the upper bound.
	 *
	 * @defaultValue `undefined` (no maximum length)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#MaxLengthConstraintComponent SHACL § 4.3.2 sh:maxLength}
	 */
	readonly maxLength?: number;

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export function text(constraints: StringLengthConstraints = {}): StringShape {

	return string({
		model: "txt",
		datatype: xsd.string,
		pattern: /^\S+(?: \S+)*$/,
		...constraints
	});

}

export function markdown(constraints: StringLengthConstraints = {}): StringShape {

	return string({
		model: "md",
		datatype: xsd.string,
		pattern: /^\S(?:[^\n]*\S)?(?:(?: {2}|\n)?\n[^\n]*\S)*$/, // !!! review
		...constraints
	});

}
