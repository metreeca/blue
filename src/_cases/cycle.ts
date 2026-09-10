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

import { id, reference, required, resource } from "../resource.js";
import { string } from "../string.js";


//// A cycle closed by an extends edge one way and a reference the other //////////////////////////////////////////////

// Both return types are inferred whichever end of the cycle is declared first.


// Extending shape first.

export function Extending() {
	return resource(Referring, { own: required(string()) });
}

export function Referring() {
	return resource({ id: id(), back: required(reference(Extending)) });
}


// Referring shape first.

export function ReferringFirst() {
	return resource({ id: id(), back: required(reference(ExtendingSecond)) });
}

export function ExtendingSecond() {
	return resource(ReferringFirst, { own: required(string()) });
}
