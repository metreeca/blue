---
title: Unions — Design
summary: Driving CRUD from sh:xone union shapes by exactly-one branch discrimination
description: How Blue drives CRUD from union shapes, resolving one branch per operation from caller-supplied input.
---

# Abstract

Blue models a union as a `sh:xone` of branches and drives full CRUD from it, not validation alone. Because branches map
fields to different predicates and classes, every value-bearing operation must commit to exactly one branch. Blue fixes
that branch by data-driven discrimination against caller-supplied input: state discriminates persistence, model
discriminates retrieval. An operation proceeds only when its input singles out one branch, and is rejected when it
matches several (ambiguous) or none (unsatisfiable); deletion stands outside the rule, clearing every branch at once.

The rule carries through traversal: applying a probe to a shape flattens the unions a path crosses into one effective
union range, and the client's union model is matched against that range by the same exactly-one check. Validation runs
the check ahead of the operation and, for retrieval, memoises the resolved branch on the model so downstream stages read
it back rather than re-deriving it. The system proves nothing about branch distinguishability; it only confirms that
each supplied input fits exactly one branch.

# Context

Unions are hard to manage, but sometimes unavoidable: `schema:location`, for instance, ranges over a plain `Text` string
or any of several structured nodes (`Place`, `PostalAddress`, `VirtualLocation`), a union fixed by the vocabulary rather
than a modelling choice. Blue supports them as first-class shapes that drive CRUD (create, read, update and delete), not
validation alone.

# Challenges

Three difficulties make unions hard to drive from shapes, and the design must answer all three.

## Persistence must pick one branch

A state value can satisfy more than one branch, but each branch may map a given field to a different predicate, so a
single value would write conflicting triples under different branches. Exactly one branch must be chosen to fix which
predicates and class to store. Deletion is the trivial sub-case: with no value to discriminate, it clears every branch
at once.

## Retrieval needs a template per branch

A union-valued property cannot be read with a single model, because each branch shapes its fields differently and so
needs its own template. The model may carry several alternatives for the property; each must single out exactly one
branch by the discriminating value or structure it carries, though several alternatives may resolve to the same branch,
since each resolves independently. An empty placeholder carries nothing to match, so it cannot separate branches that
share a storage class: the alternative has to carry a discriminating value, exactly as state does.

## Traversal must route nested branches

Collection retrieval projects across paths, and a path can cross several union-valued properties while applying
transforms along the way. Branch templates then compound, and the client must keep each branch addressable through the
whole traversal.

# Solution

A union is a `sh:xone` of branches. Discrimination is data-driven and always runs against caller-supplied input: state
drives persistence, model drives retrieval. Every operation that carries a discriminating value matches it against the
branches and proceeds only when it singles out exactly one. A match against several branches is rejected as ambiguous, a
match against none as unsatisfiable. In a multi-valued union each value is discriminated independently, so the property
may span several branches with one branch fixed per value. Deletion stands outside the rule: it carries no value to
discriminate and clears every branch at once. Retrieval therefore fixes the branch from the model before reading, rather
than discriminating stored values after the fact.

This is a runtime predicate on the input, not a static property of the shapes. Discrimination keys first on **storage
class**: the value's literal datatype or node kind separates the `Text` branch from the nodes and tells
differently-typed branches apart. Where branches share a storage class, a finer value-borne trait must separate them: a
string `pattern`, a numeric `integral` flag, a reference's target-identifier pattern, or, for nodes, the branch's own
structure (class and required properties). That structure is how the caller picks among `Place`, `PostalAddress`, and
`VirtualLocation`.

Branch shapes may share or omit properties, so a partial input can fit several branches at once, and the design does not
attempt to prove branches pairwise distinguishable at construction time: `pattern` and IRI disjointness are undecidable
in general. **Disjointness is therefore a modelling requirement:** variants sharing a storage class must carry disjoint
discriminating traits, so an input fitting several branches is rejected as ambiguous at runtime rather than refused at
construction. The caller, in turn, must carry enough discriminating data to single out one branch.

A probe (path plus pipe) applied to a shape produces an extended union: the effective union range that flattens every
union the path crosses. The client supplies a union model matched against that effective range by the very same rule,
and each alternative in the model must single out exactly one branch of the range, or the operation is rejected.
Traversal therefore needs no per-crossing reasoning: discrimination stays the one flat exactly-one check, and uniqueness
holds across the whole path exactly as it does at a root union.

# Mechanics

The system enforces nothing about shape distinguishability; it only checks each supplied input. The modeller and client
are responsible for providing enough discriminating data, and discrimination is the act of matching that input against
the branches and confirming a unique fit.

Validation runs ahead of the operation proper and performs the full exactly-one check: it matches the discriminating
input, state for persistence and model for retrieval, against the effective union range the probe produces, branch by
branch, and rejects the operation unless each alternative fits exactly one branch. That check resolves which branch
drives the union.

Validation reports only whether each input fits a branch; it transforms no value. Coercing the matched value into a
typed storage form belongs to the downstream processor, not to validation. The same exactly-one check also governs
union-typed constraint operands (relational bounds and set-matching options) met while validating a retrieval selection,
so the rule reaches beyond the CRUD values to every union-matched input.

For retrieval the discriminator is the model, so the resolution is memoised on the model itself: the resolved model is
the artifact passed down the pipeline, and validation's work is recorded there rather than in a separate cache.
Downstream processors read the driving branch back from the validated model instead of re-deriving it or guessing it
from stored values; the branch is identified by its variant shape, a union's keys being inference-only labels with no
positional meaning. A model reused across requests carries its resolution with it, so the exactly-one check is paid
once. Persistence instead resolves from the per-request state and re-discriminates each time, so its selection is never
carried on a reused model.

The memoised selection is an optimisation, not a precondition: full matching against the branches stays available as a
fallback for any stage that holds input without a resolved selection, and it reproduces the same branch validation would
have fixed.
