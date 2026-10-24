"use client";

import { useId, useState } from "react";
import { ArrowLeft, ArrowRight, Check, RotateCcw } from "lucide-react";

export type GuidedChoice = { value: string; label: string; detail?: string };
export type GuidedStep = {
  id: string;
  title: string;
  description: string;
  choices?: GuidedChoice[];
};
export type GuidedStepsProps = {
  steps: GuidedStep[];
  onComplete?: (answers: Record<string, string>) => void;
  completeTitle?: string;
  completeBody?: string;
  progressLabel?: string;
};

/** Short, data-driven step flow with reviewable choices and completion state. */
export function GuidedSteps({
  steps,
  onComplete,
  completeTitle = "You’re ready to begin.",
  completeBody = "Your choices are saved in this preview. You can start over to try another path.",
  progressLabel = "Setup guide",
}: GuidedStepsProps) {
  const id = useId();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [complete, setComplete] = useState(false);
  const step = steps[index];
  if (!step) return null;
  const requiresChoice = Boolean(step.choices?.length);
  const canContinue = !requiresChoice || Boolean(answers[step.id]);

  function next() {
    if (!canContinue) return;
    if (index < steps.length - 1) setIndex(index + 1);
    else {
      setComplete(true);
      onComplete?.(answers);
    }
  }
  function reset() {
    setIndex(0);
    setAnswers({});
    setComplete(false);
  }

  return (
    <section className="guided-steps" aria-label="Guided steps">
      <div className="guided-steps-progress">
        <span>{progressLabel}</span>
        <strong>
          {complete ? "Complete" : `Step ${index + 1} of ${steps.length}`}
        </strong>
      </div>
      <div className="guided-steps-track" aria-hidden="true">
        {steps.map((item, itemIndex) => (
          <span
            className={complete || itemIndex <= index ? "is-current" : ""}
            key={item.id}
          />
        ))}
      </div>
      {complete ? (
        <div className="guided-steps-complete" role="status">
          <span className="guided-steps-success">
            <Check size={20} />
          </span>
          <h3>{completeTitle}</h3>
          <p>{completeBody}</p>
          <button type="button" onClick={reset}>
            <RotateCcw size={15} /> Start again
          </button>
        </div>
      ) : (
        <>
          <div className="guided-steps-content" key={step.id}>
            <h3>{step.title}</h3>
            <p>{step.description}</p>
            {step.choices && (
              <fieldset className="guided-steps-choices">
                <legend className="sr-only">
                  Choose one option for {step.title}
                </legend>
                {step.choices.map((choice) => (
                  <label
                    key={choice.value}
                    className={
                      answers[step.id] === choice.value ? "is-selected" : ""
                    }
                  >
                    <input
                      type="radio"
                      name={`${id}-${step.id}`}
                      value={choice.value}
                      checked={answers[step.id] === choice.value}
                      onChange={() =>
                        setAnswers((current) => ({
                          ...current,
                          [step.id]: choice.value,
                        }))
                      }
                    />
                    <span>
                      <strong>{choice.label}</strong>
                      {choice.detail && <small>{choice.detail}</small>}
                    </span>
                    <span className="guided-steps-radio" aria-hidden="true" />
                  </label>
                ))}
              </fieldset>
            )}
          </div>
          <div className="guided-steps-actions">
            <button
              type="button"
              className="guided-steps-back"
              onClick={() => setIndex(index - 1)}
              disabled={index === 0}
            >
              <ArrowLeft size={15} /> Back
            </button>
            <button
              type="button"
              className="guided-steps-next"
              onClick={next}
              disabled={!canContinue}
            >
              {index === steps.length - 1 ? "Finish" : "Continue"}{" "}
              <ArrowRight size={15} />
            </button>
          </div>
        </>
      )}
    </section>
  );
}
