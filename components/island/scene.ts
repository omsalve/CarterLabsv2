"use client";

import { createContext } from "react";
import type { IslandScene } from "./types";

/**
 * The hero's scene, for page content that reaches out of the glass onto the map.
 * It is handed out as a getter: the scene is mutable, per-frame state, not a value
 * to render from.
 */
export const SceneContext = createContext<() => IslandScene | null>(() => null);
