"use client"

import * as React from "react"

import { cn } from "@/lib/tiptap-utils"
import "@/components/tiptap-ui-primitive/input/input.scss"

// React 18: ref 는 forwardRef 로만 전달된다(원본은 19식 일반 프롭) — 감싸서 호환.
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  function Input({ className, type, ...props }, ref) {
    return (
      <input
        ref={ref}
        type={type}
        data-slot="tiptap-input"
        className={cn("tiptap-input", className)}
        {...props}
      />
    )
  }
)

export { Input }
