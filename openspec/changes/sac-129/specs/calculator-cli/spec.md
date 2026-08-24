## Purpose

Give users one tool for quick math and unit changes. Give clear results and safe errors.

## ADDED Requirements

### Requirement: Run one math operation

The tool SHALL take a task name and two values. Each value can be digits or a number word. The tool SHALL add, subtract, multiply, and divide. It SHALL print the result.

#### Scenario: Add two numbers

- **WHEN** a user selects add and gives two numbers.
- **THEN** the tool prints their sum and ends with a success code.

#### Scenario: Read digits and number words

- **WHEN** a user selects add and gives `5` and `five`.
- **THEN** the tool reads both as the same value, prints their sum, and ends with a success code.

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

The tool SHALL change temperature units in both ways. For Celsius, it MUST subtract 32 from Fahrenheit, then multiply by 5 and divide by 9. For Fahrenheit, it MUST multiply Celsius by 9, divide by 5, then add 32.

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

The tool MUST show a clear error for bad input. It MUST end with a fail code. Bad input is an unknown task, a wrong value count, text that is not a number word, or a zero divisor. The tool MUST NOT show a crash trace.

#### Scenario: Operation is unknown

- **WHEN** a user gives a task name that the tool does not support.
- **THEN** the tool states that the task is unknown and ends with a fail code.

#### Scenario: Value count is wrong

- **WHEN** a user gives too few or too many values for the task.
- **THEN** the tool states what input is needed and ends with a fail code.

#### Scenario: Value is not a number

- **WHEN** a user gives a value that is not digits or a known number word.
- **THEN** the tool states that a number is needed and ends with a fail code.

#### Scenario: Divisor is zero

- **WHEN** a user selects divide and gives zero as the second number.
- **THEN** the tool states that it cannot divide by zero and ends with a fail code.
