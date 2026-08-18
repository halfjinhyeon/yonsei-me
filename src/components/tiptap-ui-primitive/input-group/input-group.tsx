"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/tiptap-utils"

import { Input } from "@/components/tiptap-ui-primitive/input"
import { Button } from "@/components/tiptap-ui-primitive/button"
import { Textarea } from "@/components/tiptap-ui-primitive/textarea"

import "./input-group.scss"

function InputGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="tiptap-input-group"
      role="group"
      className={cn("tiptap-input-group", className)}
      {...props}
    />
  )
}

const inputGroupAddonVariants = cva("tiptap-input-group-addon", {
  variants: {
    align: {
      "inline-start": "tiptap-input-group-addon--inline-start",
      "inline-end": "tiptap-input-group-addon--inline-end",
      "block-start": "tiptap-input-group-addon--block-start",
      "block-end": "tiptap-input-group-addon--block-end",
    },
  },
  defaultVariants: {
    align: "inline-start",
  },
})

function InputGroupAddon({
  className,
  align = "inline-start",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof inputGroupAddonVariants>) {
  return (
    <div
      role="group"
      data-slot="tiptap-input-group-addon"
      data-align={align}
      className={cn(inputGroupAddonVariants({ align }), className)}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button")) return
        e.currentTarget.parentElement?.querySelector("input")?.focus()
      }}
      {...props}
    />
  )
}

const inputGroupButtonVariants = cva("tiptap-input-group-button", {
  variants: {
    size: {
      xs: "tiptap-input-group-button--xs",
      sm: "tiptap-input-group-button--sm",
      "icon-xs": "tiptap-input-group-button--icon-xs",
      "icon-sm": "tiptap-input-group-button--icon-sm",
    },
  },
  defaultVariants: {
    size: "xs",
  },
})

function InputGroupButton({
  className,
  type = "button",
  variant = "ghost",
  size = "xs",
  ...props
}: Omit<React.ComponentProps<typeof Button>, "size" | "type"> &
  VariantProps<typeof inputGroupButtonVariants> & {
    type?: "button" | "submit" | "reset"
  }) {
  return (
    <Button
      type={type}
      data-size={size}
      variant={variant}
      className={cn(inputGroupButtonVariants({ size }), className)}
      {...props}
    />
  )
}

function InputGroupText({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span className={cn("tiptap-input-group-text", className)} {...props} />
  )
}

// React 18: ref 는 forwardRef 로만 전달된다(원본은 19식 일반 프롭) — 감싸서 호환.
const InputGroupInput = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  function InputGroupInput({ className, ...props }, ref) {
    return (
      <Input
        ref={ref}
        data-slot="tiptap-input-group-control"
        className={cn("tiptap-input-group-control", className)}
        {...props}
      />
    )
  }
)

function InputGroupTextarea({
  className,
  ...props
}: React.ComponentProps<"textarea">) {
  return (
    <Textarea
      data-slot="tiptap-input-group-control"
      className={cn(
        "tiptap-input-group-control tiptap-input-group-control--textarea",
        className
      )}
      {...props}
    />
  )
}

export {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
  InputGroupInput,
  InputGroupTextarea,
}
