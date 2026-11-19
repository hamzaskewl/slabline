"use client";
import {
  Children,
  isValidElement,
  type ComponentProps,
  type ReactElement,
} from "react";
import { Select as Primitive } from "radix-ui";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
type Props = Omit<
  ComponentProps<"select">,
  "multiple" | "size" | "onChange"
> & { onChange?: (event: { target: { value: string } }) => void };
const EMPTY = "__cm_empty__";
/** Styled, keyboard-accessible select shared by filters, wallets and trading. */
export function Select({
  children,
  value,
  defaultValue,
  onChange,
  className = "",
  id,
  disabled,
  name,
  required,
  ...rest
}: Props) {
  const options: ReactElement<ComponentProps<"option">>[] = [];
  function collect(nodes: Props["children"]) {
    Children.forEach(nodes, (child) => {
      if (!isValidElement(child)) return;
      if (child.type === "option")
        options.push(child as ReactElement<ComponentProps<"option">>);
      else collect((child.props as { children?: Props["children"] }).children);
    });
  }
  collect(children);
  return (
    <Primitive.Root
      value={value === undefined ? undefined : String(value) || EMPTY}
      defaultValue={
        defaultValue === undefined ? undefined : String(defaultValue) || EMPTY
      }
      onValueChange={(v) =>
        onChange?.({ target: { value: v === EMPTY ? "" : v } })
      }
      disabled={disabled}
      name={name}
      required={required}
    >
      <Primitive.Trigger
        id={id}
        aria-label={rest["aria-label"]}
        aria-labelledby={rest["aria-labelledby"]}
        aria-describedby={rest["aria-describedby"]}
        className={`market-select-trigger app-select ${className}`}
      >
        <Primitive.Value placeholder="Choose…" />
        <Primitive.Icon className="select-chevron">
          <ChevronDown size={16} aria-hidden="true" />
        </Primitive.Icon>
      </Primitive.Trigger>
      <Primitive.Portal>
        <Primitive.Content
          className="market-select-menu app-select-menu"
          position="popper"
          sideOffset={6}
          collisionPadding={12}
        >
          <Primitive.ScrollUpButton className="select-scroll">
            <ChevronUp size={16} />
          </Primitive.ScrollUpButton>
          <Primitive.Viewport>
            {options.map((option) => (
              <Primitive.Item
                className="market-select-option"
                key={String(option.props.value)}
                value={String(option.props.value ?? "") || EMPTY}
                disabled={option.props.disabled}
              >
                <Primitive.ItemText>{option.props.children}</Primitive.ItemText>
                <Primitive.ItemIndicator>
                  <Check size={16} />
                </Primitive.ItemIndicator>
              </Primitive.Item>
            ))}
          </Primitive.Viewport>
          <Primitive.ScrollDownButton className="select-scroll">
            <ChevronDown size={16} />
          </Primitive.ScrollDownButton>
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
