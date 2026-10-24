"use client";

import { useId, useState, type FieldsetHTMLAttributes } from "react";

export type ChoiceCardOption = {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
};

export type ChoiceCardGroupProps = Omit<
  FieldsetHTMLAttributes<HTMLFieldSetElement>,
  "onChange" | "children"
> & {
  label: string;
  description?: string;
  options: ChoiceCardOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  required?: boolean;
};

/** A native radio group with enough space to explain each choice. */
export function ChoiceCardGroup({
  label,
  description,
  options,
  value,
  defaultValue = "",
  onChange,
  name,
  form,
  required = false,
  disabled = false,
  className = "",
  ...fieldsetProps
}: ChoiceCardGroupProps) {
  const generatedId = useId();
  const [internalValue, setInternalValue] = useState(defaultValue);
  const selected = value ?? internalValue;
  const groupName = name ?? generatedId;
  const descriptionId = `${generatedId}-description`;

  return (
    <fieldset
      {...fieldsetProps}
      className={`choice-card-group ${className}`}
      disabled={disabled}
      form={form}
      aria-describedby={
        [fieldsetProps["aria-describedby"], description ? descriptionId : ""]
          .filter(Boolean)
          .join(" ") || undefined
      }
    >
      <legend>{label}</legend>
      {description && (
        <p className="choice-card-group-description" id={descriptionId}>
          {description}
        </p>
      )}
      <div className="choice-card-options">
        {options.map((option, index) => {
          const optionId = `${generatedId}-${index}`;
          return (
            <label
              key={option.value}
              className="choice-card"
              data-disabled={disabled || option.disabled}
            >
              <input
                id={optionId}
                type="radio"
                name={groupName}
                form={form}
                value={option.value}
                checked={selected === option.value}
                disabled={option.disabled}
                required={required}
                aria-labelledby={`${optionId}-label`}
                aria-describedby={
                  option.description ? `${optionId}-description` : undefined
                }
                onChange={() => {
                  if (value === undefined) setInternalValue(option.value);
                  onChange?.(option.value);
                }}
              />
              <span className="choice-card-copy">
                <strong id={`${optionId}-label`}>{option.label}</strong>
                {option.description && (
                  <span id={`${optionId}-description`}>
                    {option.description}
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
