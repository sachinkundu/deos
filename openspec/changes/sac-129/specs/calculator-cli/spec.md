## Purpose

Give users one tool for quick math and unit changes. Give clear results and safe errors.

## ADDED Requirements

### Requirement: Run one math operation

The tool SHALL take a task name and two numbers. It SHALL add, subtract, multiply, and divide. It SHALL print the result.

#### Scenario: Add two numbers

- **WHEN** a user selects add and gives two numbers.
- **THEN** the tool prints their sum and ends with a success code.

#### Scenario: Subtract two numbers

- **WHEN** a user selects subtract and gives two numbers.
- **THEN** the tool prints the second number taken from the first and ends with a success code.

#### Scenario: Multiply two numbers

- **WHEN** a user selects multiply and gives two numbers.
- **THEN** the tool prints their product and ends with a success code.

#### Scenario: Divide two numbers

- **WHEN** a user selects divide and gives two numbers, and the second number is not zero.
- **THEN** the tool prints the first number split by the second and ends with a success code.

### Requirement: Change temperature units

The tool SHALL change heat units in both ways. Celsius MUST be `(Fahrenheit - 32) × 5 / 9`. Fahrenheit MUST be `(Celsius × 9 / 5) + 32`.

#### Scenario: Change Fahrenheit to Celsius

- **WHEN** a user selects Fahrenheit to Celsius and gives a number.
- **THEN** the tool prints the Celsius value and ends with a success code.

#### Scenario: Change Celsius to Fahrenheit

- **WHEN** a user selects Celsius to Fahrenheit and gives a number.
- **THEN** the tool prints the Fahrenheit value and ends with a success code.

### Requirement: Change angle units

The tool SHALL change angle units in both ways. It SHALL treat 180 degrees as equal to pi radians.

#### Scenario: Change degrees to radians

- **WHEN** a user selects degrees to radians and gives a number.
- **THEN** the tool prints the radian value and ends with a success code.

#### Scenario: Change radians to degrees

- **WHEN** a user selects radians to degrees and gives a number.
- **THEN** the tool prints the degree value and ends with a success code.

### Requirement: Report bad input safely

The tool MUST show a clear error and end with a fail code for an unknown task, a wrong value count, text in place of a number, or a zero divisor. It MUST NOT show a crash trace for these errors.

#### Scenario: Operation is unknown

- **WHEN** a user gives a task name that the tool does not support.
- **THEN** the tool states that the task is unknown and ends with a fail code.

#### Scenario: Value count is wrong

- **WHEN** a user gives too few or too many values for the task.
- **THEN** the tool states what input is needed and ends with a fail code.

#### Scenario: Value is not a number

- **WHEN** a user gives a value that cannot be read as a number.
- **THEN** the tool states that a number is needed and ends with a fail code.

#### Scenario: Divisor is zero

- **WHEN** a user selects divide and gives zero as the second number.
- **THEN** the tool states that it cannot divide by zero and ends with a fail code.
