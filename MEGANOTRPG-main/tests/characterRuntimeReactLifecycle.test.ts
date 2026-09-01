import assert from "node:assert/strict"
import test from "node:test"
import React, { act, useEffect, useState, type ReactNode } from "react"
import { createRoot } from "react-dom/client"

import {
  clearCharacterTemplateBundles,
  registerCharacterTemplateBundles,
  subscribeCharacterTemplateBundles,
} from "../src/rule-templates/registry.ts"
import type { CharacterTemplateBundle } from "../src/rule-templates/types.ts"

type Listener = (...args: unknown[]) => void

class FakeNode {
  nodeType: number
  nodeName: string
  ownerDocument: FakeDocument
  parentNode: FakeNode | null = null
  childNodes: FakeNode[] = []
  textContent = ""
  private listeners = new Map<string, Set<Listener>>()

  constructor(nodeType: number, nodeName: string, ownerDocument: FakeDocument) {
    this.nodeType = nodeType
    this.nodeName = nodeName
    this.ownerDocument = ownerDocument
  }

  appendChild<T extends FakeNode>(node: T): T {
    node.parentNode = this
    this.childNodes.push(node)
    return node
  }

  insertBefore<T extends FakeNode>(node: T, before: FakeNode | null): T {
    node.parentNode = this
    const index = before ? this.childNodes.indexOf(before) : -1
    if (index < 0) this.childNodes.push(node)
    else this.childNodes.splice(index, 0, node)
    return node
  }

  removeChild<T extends FakeNode>(node: T): T {
    const index = this.childNodes.indexOf(node)
    if (index >= 0) this.childNodes.splice(index, 1)
    node.parentNode = null
    return node
  }

  addEventListener(type: string, listener: Listener) {
    const group = this.listeners.get(type) || new Set<Listener>()
    group.add(listener)
    this.listeners.set(type, group)
  }

  removeEventListener(type: string, listener: Listener) {
    this.listeners.get(type)?.delete(listener)
  }
}

class FakeElement extends FakeNode {
  tagName: string
  namespaceURI = "http://www.w3.org/1999/xhtml"
  style: Record<string, string> = {}
  attributes = new Map<string, string>()

  constructor(tagName: string, ownerDocument: FakeDocument) {
    super(1, tagName.toUpperCase(), ownerDocument)
    this.tagName = tagName.toUpperCase()
  }

  setAttribute(name: string, value: string) { this.attributes.set(name, String(value)) }
  removeAttribute(name: string) { this.attributes.delete(name) }
}

class FakeIFrameElement extends FakeElement {}

class FakeText extends FakeNode {
  nodeValue: string
  constructor(value: string, ownerDocument: FakeDocument) {
    super(3, "#text", ownerDocument)
    this.nodeValue = value
    this.textContent = value
  }
}

class FakeDocument extends FakeNode {
  documentElement: FakeElement
  body: FakeElement
  defaultView: typeof globalThis
  activeElement: FakeElement | null = null

  constructor() {
    // ownerDocument is replaced immediately after super; React only sees the
    // fully constructed document.
    super(9, "#document", null as unknown as FakeDocument)
    this.ownerDocument = this
    this.defaultView = globalThis
    this.documentElement = new FakeElement("html", this)
    this.body = new FakeElement("body", this)
    this.documentElement.appendChild(this.body)
    this.appendChild(this.documentElement)
  }

  createElement(tagName: string) {
    return tagName.toLowerCase() === "iframe"
      ? new FakeIFrameElement(tagName, this)
      : new FakeElement(tagName, this)
  }
  createElementNS(_namespace: string, tagName: string) { return new FakeElement(tagName, this) }
  createTextNode(value: string) { return new FakeText(value, this) }
}

function bundle(): CharacterTemplateBundle {
  return {
    assignment: {
      id: "assignment-react-lifecycle",
      character_id: "hero-react-lifecycle",
      template_id: "fighter-react-lifecycle",
      template_level: 5,
      selected_choices: {},
      assigned_at: "2026-08-30T20:00:00.000Z",
      updated_at: "2026-08-30T20:00:00.000Z",
    },
    template: {
      id: "fighter-react-lifecycle",
      campaign_id: "campaign-react-lifecycle",
      kind: "class",
      slug: "fighter-react-lifecycle",
      name: "Воин",
      description: "",
      version: 1,
      mechanics: [],
      choices: [],
      parent_template_id: null,
      unlock_level: 1,
      catalog_key: null,
      catalog_revision: null,
      source_kind: "custom",
      source_label: "",
      is_builtin: false,
      mechanical_summary: "",
      author_description: "",
      author_comment: "",
      rules_meta: {},
      is_active: true,
      created_by: "gm-react-lifecycle",
      created_at: "2026-08-30T20:00:00.000Z",
      updated_at: "2026-08-30T20:00:00.000Z",
    },
    levels: [],
  }
}

function FrameLifecycleHarness({ characterId, children }: { characterId: string; children: ReactNode }) {
  const [, setAssignedRevision] = useState(0)
  useEffect(() => subscribeCharacterTemplateBundles(characterId, () => {
    setAssignedRevision((value) => value + 1)
  }), [characterId])

  // This is the fixed CharacterGameFrame identity rule: invalidation rerenders
  // the frame, but children are not cloned with a revision-derived key. Keep
  // this harness independent from app .tsx modules because the repository test
  // command intentionally uses Node's native TypeScript runner.
  return React.createElement(React.Fragment, null, children)
}

test("real React lifecycle: registry invalidation rerenders Frame without remounting Profile", async () => {
  const document = new FakeDocument()
  const previousDocument = Reflect.get(globalThis, "document")
  const previousWindow = Reflect.get(globalThis, "window")
  const previousAct = Reflect.get(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  const previousIFrameElement = Reflect.get(globalThis, "HTMLIFrameElement")
  Reflect.set(globalThis, "document", document)
  Reflect.set(globalThis, "window", globalThis)
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
  Reflect.set(globalThis, "HTMLIFrameElement", FakeIFrameElement)

  const characterId = "hero-react-lifecycle"
  clearCharacterTemplateBundles(characterId)
  let mounts = 0
  let unmounts = 0

  function ProfileProbe() {
    useEffect(() => {
      mounts += 1
      return () => { unmounts += 1 }
    }, [])
    return React.createElement("div", null, "profile")
  }

  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container as unknown as Element)

  try {
    await act(async () => {
      root.render(React.createElement(
        FrameLifecycleHarness,
        { characterId },
        React.createElement(ProfileProbe),
      ))
    })
    assert.equal(mounts, 1)
    assert.equal(unmounts, 0)

    await act(async () => {
      registerCharacterTemplateBundles(characterId, [bundle()])
    })
    assert.equal(mounts, 1, "template invalidation must not remount the profile")
    assert.equal(unmounts, 0)

    await act(async () => {
      registerCharacterTemplateBundles(characterId, [structuredClone(bundle())])
    })
    assert.equal(mounts, 1, "semantic duplicate must not remount or fan out")
    assert.equal(unmounts, 0)
  } finally {
    await act(async () => { root.unmount() })
    clearCharacterTemplateBundles(characterId)
    if (previousDocument === undefined) Reflect.deleteProperty(globalThis, "document")
    else Reflect.set(globalThis, "document", previousDocument)
    if (previousWindow === undefined) Reflect.deleteProperty(globalThis, "window")
    else Reflect.set(globalThis, "window", previousWindow)
    if (previousAct === undefined) Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
    else Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", previousAct)
    if (previousIFrameElement === undefined) Reflect.deleteProperty(globalThis, "HTMLIFrameElement")
    else Reflect.set(globalThis, "HTMLIFrameElement", previousIFrameElement)
  }

  assert.equal(unmounts, 1, "profile unmounts exactly once when the whole root is intentionally destroyed")
})
