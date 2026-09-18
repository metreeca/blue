---
title: Unions — Design
summary: Driving CRUD from union shapes, matched as sh:xone on write and sh:or on read
description: How Blue matches a value, a relational bound and a retrieval placeholder against the branches of a union.
---

# Abstract

Blue models a union as a set of branches and drives full CRUD from it, not validation alone.

Matching a union runs in three regimes, named by the `state | bound | model` strictness a caller selects and
distinguished by which SHACL logical constraint governs: **`sh:xone`** (exactly one) for a **state** value and for a
**bound**, **`sh:or`** (at least one) for a **model** placeholder. Every regime requires at least one match; they
differ in whether more than one is allowed, and in the constraints the match is tested against.

A **state** value carries content and MUST match **exactly one** branch (`sh:xone`), tested against **all** shape
constraints: it is a legal value, and the single branch it singles out fixes the predicates and class that drive the
storage operation.

A **bound** is a relational operand (`<`, `>`, `<=`, `>=`) and MUST likewise match **exactly one** branch, but it is
not a legal element value: it skips the value-domain constraints and keys on the syntactic discriminators (`kind`, and
`pattern` where literal branches share a kind) alone, so it requires the union's literal branches to be literally
disjoint.

A **model** placeholder carries no content and MUST match **at least one** branch (`sh:or`), tested **by form alone**
and ignoring every constraint: it states which values are wanted and no longer what they are, so it MAY match several
branches, retrieving each while discriminating nothing on its own. Three forms are told apart, and each reaches the
branches coming back under it: the **atomic** placeholder `{}` asks for the value as it stands and reaches every
branch but an embedded resource, which states no identifier to come back as; a **nested template** reaches the
branches naming a resource; a map of **tag ranges** reaches the localised branches.

Every regime rejects a value matching **no** branch as **unsatisfiable**; only a regime required to single out a branch
rejects one matching several, as **ambiguous**. Deletion stands outside the rule, carrying no value to match and
clearing every branch at once.

The same rule carries through path traversal: when a query path crosses several union-valued members, their branches
collapse into a single combined set, and the caller's input is matched against that set under the regime that applies.

# Context

Unions are hard to manage, but sometimes unavoidable: `schema:location`, for instance, ranges over a plain string or any
of several structured nodes (`Place`, `PostalAddress`, `VirtualLocation`), a union fixed by the vocabulary rather than a
modelling choice. Blue supports them as first-class shapes that drive CRUD (create, read, update and delete), not
validation alone.

Writing and reading a union are not symmetric. A write carries a real value that must be stored under one branch. A read
carries no value, only a request for whatever branch the stored value belongs to.

# Challenges

Three difficulties make unions hard to drive from shapes, and the design must answer all three.

## Persistence must commit to one branch

A state value can satisfy more than one branch, but each branch may map a given field to a different predicate, so a
single value would write conflicting triples under different branches. Storage needs **exactly one** branch to fix which
predicates and class to write, yet a value that fits several offers no inherent way to choose.

## Retrieval cannot know which branch is stored

Each branch of a union-valued property shapes its fields differently, so each needs its own template. A read cannot know
in advance which branch a given resource used: the value was committed to one branch at write time, invisibly to the
reader. A request that asked for a single branch would miss every resource stored under another, so retrieval must be
able to reach every branch that could answer.

## Traversal must route nested branches

Collection retrieval projects across paths, and a path can cross several union-valued members while applying transforms
along the way. Branch templates then compound, and the caller must keep each branch addressable through the whole
traversal.

# Solution

A union declares a set of branches, matched as `sh:xone` where the input must commit to one branch and as `sh:or` where
it need not. Matching is data-driven and always runs against caller-supplied input, but the rule depends on whether that
input carries content and on whether that content is a legal element value. Matching only fixes which branch drives the
operation; coercing the matched value and carrying out the operation itself belong to the downstream processor.

## State — exactly one branch, by value (`sh:xone`)

A state value drives persistence and MUST single out **exactly one** branch (`sh:xone`). Matching tests **value-domain
membership** against **all** shape constraints, so the value is a legal member of the branch it selects. It keys first
on **storage class**: the value's literal datatype or node kind separates a string branch from the nodes and tells
differently-typed branches apart. Where branches share a storage class, a finer value-borne trait must separate them: a
string `pattern`, a numeric `integral` flag, an `in` enumeration admitting values the sibling branches exclude, a
reference's target-identifier pattern, or, for nodes, the branch's own structure (class and required members) together
with the values those members are closed to, as when a boolean tag fixes one branch per truth value. A value matching
no branch is **unsatisfiable** and a value matching several is **ambiguous**, and both are rejected. In a multi-valued
union each value is matched independently, so the property may span several branches with one branch fixed per value.

Branch shapes may share or omit members, so a partial value can fit several branches at once. Blue does not try to prove
the branches distinguishable when the shape is built: in general, `pattern` and IRI disjointness are undecidable.
**Disjointness is therefore a modelling requirement:** branches sharing a storage class must carry disjoint
discriminating traits, so a legal value fits exactly one branch and an ambiguous value is rejected at runtime rather
than refused at construction. The modeller owns disjointness; the writer, in turn, must carry enough data to single out
one branch.

A stronger grade, **literal disjointness**, admits only **syntactic** discriminators. Two literal branches are literally
disjoint when `kind` and `pattern` tell them apart with no reference to any value-domain facet, so no well-formed
literal satisfies both: a numeric or boolean branch carries no `pattern`, so a union admits **at most one**
literal branch of each such kind, and string branches may coexist only when their patterns are mutually exclusive
(`date` versus `gYear`, never `date` versus an unconstrained `string`). It is stronger than the disjointness a state
value needs, which may also lean on value-domain traits such as an `integral` flag or disjoint `in` sets; a value
carrying no legal-membership guarantee and matched by syntactic form alone, such as a relational bound (see
*Constraint operands*, below), requires it.

## Model — at least one branch, by form (`sh:or`)

A retrieval model addresses a union through two kinds of slot, matched by different rules: the **retrieval templates**
that project the property, and, on a collection, the **operands** of the constraints that filter it.

### Retrieval templates

A model placeholder MUST match **at least one** branch (`sh:or`), but no more is required. Matching tests **form
alone** and ignores every constraint, the placeholder carrying no value of its own to test:

- the **atomic** placeholder `{}` asks for the value as it stands, so it matches every branch coming back as one: a
  literal, a reference, as the identifier naming its target, and a localised map, coalesced under the request's
  language priority. An embedded resource states no identifier to come back as and is reached through a template
  alone.
- a **nested template** matches every resource branch declaring the members it asks for, reached either directly or
  across a reference branch pointing at that resource. A template states what to bring back rather than what is held,
  so it is held to the declared members but **not to their presence**: a template asking for part of a resource
  matches it all the same.
- a map of **tag ranges** matches the localised branches alone, asking for their text tag by tag. A map has nowhere
  to sit among the values the sibling branches carry, so a localised branch takes it within a **projection column**
  alone, where each branch is asked for under a column of its own; elsewhere the branch comes back coalesced, through
  the atomic placeholder.

A placeholder matching several branches retrieves each; one matching **no** branch is **unsatisfiable** and rejected,
exactly as a state value is.

The keyed union form supplies one alternative placeholder per branch, keyed by opaque non-negative integer strings that
carry no positional meaning. Each alternative is matched independently, so several alternatives may resolve to
overlapping branches and each still retrieves. An atomic alternative does not tell same-kind branches apart and so
requests all of them; a template alternative's structure discriminates the resource branches it fits. Branches left
unmatched by every alternative are skipped at retrieval, contributing no values. At read time the stored value,
belonging to one disjoint branch, determines which requested branch actually returns. A union whose branches all come
back as values needs no keyed form at all: the atomic placeholder addresses the property directly and retrieves each.

Because the placeholder never discriminates, the model needs no disjointness guarantee and imposes no legality on its
values: a read is well-formed as long as the store could hold a compatible value on some matched branch. Literal
disjointness therefore buys nothing at retrieval, where it once told same-kind placeholders apart; it is required by
the constraint operands alone.

### Constraint operands and text search

The constraints narrowing a collection are part of the model, but two of their operands carry content rather than
placeholders, and match by their own rules.

A relational **bound** must single out **exactly one** branch, since a processor needs a single branch to convert the
value against, but it is **not** a legal element value: a comparison filters by order, so `>= 8` over a
`[1, 5]` domain is a legal query returning nothing, not an error. Testing a bound against all constraints would wrongly
reject it, so a bound relaxes the **value-domain facets** (numeric bounds `minInclusive` … `maxExclusive`, `integral`,
string length, `languageIn`, `in`, `hasValue`) and keys **only on the syntactic traits** that pin a branch: the value's
processing `kind` and, where literal branches share a kind, their lexical `pattern`. A bound matching several branches
is ambiguous and one matching none unsatisfiable, both rejected. Because it is matched by syntactic form alone, a bound
requires the union to be **literally disjoint** (see *State*, above); a union that is not is rejected at runtime by the
ambiguous-match rule.

A set-matching **option** must likewise single out **exactly one** branch, and is likewise **not** held to a legal
element value: a filter tests membership by equality, so an option outside the domain is a legal query matching nothing,
exactly as an out-of-range bound is. An option relaxes the value-domain facets the same way, and keys on the value's
processing `kind` alone, the lexical `pattern` included among what it relaxes, so branches sharing a kind are told apart
by nothing: options require the union to be **kind-disjoint**, a grade stronger than the literal disjointness a bound
needs. This holds for every option-bearing operator alike: the disjunctive `?`, the conjunctive `!`, and the sort-focus
`+`. An option matching several branches is ambiguous and one matching none is unsatisfiable, both rejected; a `null`
option is typeless and exempt.

A **localised** branch takes its options as the strings a tag carries, stated either plainly, as the text any tag may
match, or grouped in a map keyed by the tag they are to match under. A tag carries as many options as the filter lists,
whatever arity the branch admits, since the map states what to test membership against rather than a value a resource
holds. The two forms are never mixed within one set, and a key that is not a language tag is rejected.

A text-search **keywords** operand (`~`) is neither a placeholder nor a data value but a plain search string. It is not
matched against the branches at all: it applies to **every** string branch of the union at once, filtering their values
existentially, and the non-string branches simply do not support it.

## Traversal — one effective union range

A probe (path plus pipe) flattens every union its path crosses into one effective union range. Probes appear only in
retrieval, but the range still meets **both** regimes, according to the probe's role:

- a **projection binding** carries a placeholder, matched by the model rule: at least one branch, by form;
- a **constraint operator** carries an option or a bound, both by the relaxed rule: exactly one branch, by `kind` and,
  for a bound alone, by `pattern`.

Either input matches the flattened range exactly as it would a root union, so traversal needs no per-crossing reasoning:
the rule stays flat across the whole path.
