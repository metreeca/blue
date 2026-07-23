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

/**
 * Shared validation vocabulary.
 *
 * Provides the SHACL namespace ({@link sh}) and the validation strictness selector ({@link Scope}).
 *
 * Trace definitions and the composable validators reporting into them live in the `@metreeca/core/trace` module.
 *
 * @module
 */

import { createNamespace, type Namespace } from "@metreeca/core/resource";


/**
 * SHACL vocabulary namespace.
 *
 * An open {@link Namespace} over `http://www.w3.org/ns/shacl#`, resolving any SHACL term as a named property.
 *
 * @see {@link https://www.w3.org/TR/shacl/ Shapes Constraint Language (SHACL)}
 */
export const sh: Namespace = createNamespace("http://www.w3.org/ns/shacl#");


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Validation strictness for matching a value against a shape.
 *
 * Selects how much of a shape the value validators enforce, so a caller can match the same shape against a stored
 * value, a relational bound, or a retrieval model:
 *
 * - `"state"` enforces **every** constraint: the value must be a legal element of the shape's domain.
 * - `"bound"` keeps the syntactic discriminators (`kind`, and a literal branch's `pattern`) but skips the value-domain
 *   magnitude constraints, so a relational bound lying outside the domain still matches by form alone.
 * - `"model"` matches by `kind` alone, ignoring every other constraint, so a retrieval placeholder need not be legal.
 *
 * @see [Unions — Design](./union.md)
 */
export type Scope=
	| "state"
	| "bound"
	| "model"
