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
 * Dictionary shape operators.
 *
 * @module
 */

import type { Eager, Lazy } from "@metreeca/core";
import type { DictionaryConstraints, DictionaryShape } from "./dictionary.js";


/**
 * Checks whether a localised shape admits a single string under each tag.
 *
 * Yields `true` where the shape states {@link DictionaryConstraints.uniqueLang | uniqueLang}, so that the content of a
 * tag is resolved at the arity the shape admits: a bare string where it is unique, an array of strings otherwise. A
 * shape leaving the constraint unstated, or stating it only as a boolean, admits several strings under each tag.
 *
 * @typeParam S The describing shape, possibly deferred to break definition cycles
 */
export type Unique<S extends Lazy<DictionaryShape>> =
	Eager<S> extends { readonly uniqueLang: true } ? true : false
