package com.brightsteps.app

private const val SLOW = "Take your time. Read it again slowly."

sealed interface Step {
    val text: String
    val visual: String
    val hint: String get() = ""
}

data class Learn(override val text: String, override val visual: String = "") : Step

data class Choice(
    override val text: String,
    val options: List<String>,
    val answer: String,
    override val visual: String = "",
    override val hint: String = SLOW,
) : Step

data class NumberInput(
    override val text: String,
    val answer: Int,
    override val visual: String = "",
    override val hint: String = SLOW,
) : Step

data class Lesson(val title: String, val steps: List<Step>)

data class Course(
    val id: String,
    val emoji: String,
    val title: String,
    val subtitle: String,
    val lessons: List<Lesson>,
) {
    fun lessonId(i: Int) = "$id/$i"
}

val Step.answerText: String
    get() = when (this) {
        is Choice -> answer
        is NumberInput -> answer.toString()
        is Learn -> ""
    }

fun Step.isCorrect(input: String) = when (this) {
    is Choice -> input == answer
    is NumberInput -> input.toIntOrNull() == answer
    is Learn -> true
}

val COURSES = listOf(
    Course(
        "numbers", "🔢", "Numbers", "Counting, comparing and place value",
        listOf(
            Lesson("Counting", listOf(
                Learn("We count to find out how many. Touch each apple and say a number: 1, 2, 3. There are 3 apples.", "🍎 🍎 🍎"),
                NumberInput("How many stars?", 5, "⭐ ⭐ ⭐ ⭐ ⭐", "Touch each star and count slowly."),
                NumberInput("How many fish?", 4, "🐟 🐟 🐟 🐟", "Touch each fish and count slowly."),
                Choice("Which group has 2 dogs?", listOf("🐶", "🐶 🐶", "🐶 🐶 🐶"), "🐶 🐶"),
                NumberInput("How many hearts?", 7, "💙 💙 💙 💙\n💙 💙 💙", "Count the top row, then keep counting the bottom row."),
            )),
            Lesson("Bigger and smaller", listOf(
                Learn("When we compare, we find the bigger number. 5 is bigger than 3, because 5 apples is more than 3 apples.", "🍎🍎🍎🍎🍎\n🍎🍎🍎"),
                Choice("Which number is bigger?", listOf("4", "9"), "9", hint = "Count up from 1. Which number comes later?"),
                Choice("Which number is smaller?", listOf("7", "2"), "2", hint = "Count up from 1. Which number comes first?"),
                Learn("We can use a sign to compare. The open mouth of > points to the bigger number. 8 > 3 means 8 is bigger than 3.", "8 > 3"),
                Choice("Which sign goes in the box?", listOf(">", "<", "="), "<", "6 ⬜ 10", "The open side points to the bigger number."),
                Choice("Which sign goes in the box?", listOf(">", "<", "="), "=", "7 ⬜ 7", "Both numbers are the same."),
            )),
            Lesson("Tens and ones", listOf(
                Learn("Big numbers are made of tens and ones. 23 means 2 tens and 3 ones.", "🔟🔟 + 1️⃣1️⃣1️⃣"),
                NumberInput("What number is 3 tens and 4 ones?", 34, "🔟🔟🔟 + 1️⃣1️⃣1️⃣1️⃣", "3 tens is 30. Then add 4 more."),
                Choice("How many tens are in 52?", listOf("2", "5", "52"), "5", hint = "The first digit tells the tens."),
                NumberInput("What number is 1 ten and 6 ones?", 16, "🔟 + 1️⃣1️⃣1️⃣1️⃣1️⃣1️⃣", "1 ten is 10. Then add 6 more."),
            )),
        ),
    ),
    Course(
        "addsub", "➕", "Adding and Taking Away", "Plus, minus and making 10",
        listOf(
            Lesson("Adding", listOf(
                Learn("Adding means putting groups together. 2 apples and 1 more apple makes 3 apples. We write 2 + 1 = 3.", "🍎🍎 + 🍎 = 🍎🍎🍎"),
                NumberInput("What is 3 + 2?", 5, "🐱🐱🐱 + 🐱🐱", "Start at 3. Count 2 more: 4, 5."),
                NumberInput("What is 4 + 4?", 8, "🔵🔵🔵🔵 + 🔵🔵🔵🔵", "Count all the circles."),
                NumberInput("What is 6 + 3?", 9, hint = "Start at 6. Count 3 more: 7, 8, 9."),
                Choice("Sam has 5 cars. He gets 2 more. How many cars does he have now?", listOf("6", "7", "8"), "7", "🚗🚗🚗🚗🚗 + 🚗🚗", "Getting more means adding. 5 + 2."),
            )),
            Lesson("Taking away", listOf(
                Learn("Subtracting means taking away. There are 5 balloons. 2 fly away. 3 are left. We write 5 − 2 = 3.", "🎈🎈🎈🎈🎈 − 🎈🎈"),
                NumberInput("What is 4 − 1?", 3, "🍪🍪🍪🍪 − 🍪", "Start with 4 cookies. Take 1 away."),
                NumberInput("What is 7 − 3?", 4, hint = "Start at 7. Count back 3: 6, 5, 4."),
                NumberInput("What is 10 − 5?", 5, "🖐️🖐️ − 🖐️", "10 fingers. Hide one hand."),
                Choice("You have 6 grapes. You eat 2. How many are left?", listOf("3", "4", "8"), "4", "🍇🍇🍇🍇🍇🍇", "Eating takes away. 6 − 2."),
            )),
            Lesson("Making 10", listOf(
                Learn("Making 10 is a super trick. 7 + 3 = 10. 6 + 4 = 10. These are number friends.", "🟦🟦🟦🟦🟦🟦🟦🟨🟨🟨"),
                NumberInput("7 + ? = 10. What is the missing number?", 3, "🟦🟦🟦🟦🟦🟦🟦⬜⬜⬜", "Count the empty squares."),
                NumberInput("What is 10 + 5?", 15, hint = "10 and 5 more is fifteen."),
                NumberInput("What is 8 + 5?", 13, hint = "8 + 2 makes 10. Then 3 more makes 13."),
                NumberInput("What is 12 + 6?", 18, hint = "Start at 12. Count 6 more."),
            )),
        ),
    ),
    Course(
        "muldiv", "✖️", "Times and Sharing", "Multiplication and division",
        listOf(
            Lesson("Groups of", listOf(
                Learn("Multiplying is adding the same group again and again. 3 groups of 2 is 2 + 2 + 2 = 6. We write 3 × 2 = 6.", "👟👟  👟👟  👟👟"),
                NumberInput("Each dog has 4 legs. How many legs do 2 dogs have?", 8, "🐕 🐕", "4 + 4"),
                NumberInput("What is 3 × 3?", 9, "🍓🍓🍓\n🍓🍓🍓\n🍓🍓🍓", "Count all the strawberries."),
                NumberInput("What is 5 × 2?", 10, hint = "2 + 2 + 2 + 2 + 2"),
                Choice("Which is the same as 4 × 3?", listOf("4 + 3", "3 + 3 + 3 + 3", "4 + 4"), "3 + 3 + 3 + 3", hint = "4 groups of 3."),
                NumberInput("What is 10 × 4?", 40, hint = "Count by tens: 10, 20, 30, 40."),
            )),
            Lesson("Sharing fairly", listOf(
                Learn("Dividing means sharing fairly. 6 cookies shared by 2 friends: each friend gets 3. We write 6 ÷ 2 = 3.", "🍪🍪🍪 | 🍪🍪🍪"),
                NumberInput("8 cookies are shared by 2 friends. How many does each friend get?", 4, "🍪🍪🍪🍪🍪🍪🍪🍪", "Make 2 equal groups."),
                NumberInput("What is 9 ÷ 3?", 3, "⚽⚽⚽⚽⚽⚽⚽⚽⚽", "Make 3 equal groups from 9."),
                NumberInput("What is 12 ÷ 4?", 3, hint = "Which number times 4 makes 12?"),
                Choice("10 ÷ 2 = 5. So what is 5 × 2?", listOf("7", "10", "3"), "10", hint = "Multiplying undoes dividing."),
            )),
        ),
    ),
    Course(
        "fractions", "🍕", "Fractions", "Parts of a whole",
        listOf(
            Lesson("Halves and quarters", listOf(
                Learn("A fraction is a part of a whole. This bar has 2 equal parts. 1 part is colored. That is one half, written 1/2.", "🟧⬜"),
                Choice("What fraction is colored?", listOf("1/2", "1/3", "1/4"), "1/4", "🟧⬜⬜⬜", "Count all the parts. That is the bottom number."),
                Choice("What fraction is colored?", listOf("1/3", "2/3", "3/3"), "2/3", "🟧🟧⬜", "How many parts are colored? That is the top number."),
                Learn("The bottom number says how many equal parts there are. The top number says how many parts we take.", "3/4 = 🟧🟧🟧⬜"),
                Choice("Which bar shows 3/5?", listOf("🟧🟧🟧⬜⬜", "🟧🟧⬜⬜⬜", "🟧🟧🟧🟧🟧"), "🟧🟧🟧⬜⬜", hint = "Find the bar with 3 colored parts out of 5."),
            )),
            Lesson("Comparing fractions", listOf(
                Learn("Cutting a pizza into more pieces makes each piece smaller. 1/2 of a pizza is bigger than 1/4 of the same pizza.", "🍕"),
                Choice("Which is bigger?", listOf("1/2", "1/8"), "1/2", hint = "Fewer pieces means each piece is bigger."),
                Choice("Which is bigger?", listOf("2/5", "4/5"), "4/5", hint = "The pieces are the same size. Which has more pieces?"),
                Choice("Which fraction is one whole?", listOf("1/4", "4/4", "0/4"), "4/4", "🟧🟧🟧🟧", "All the parts are colored."),
                Choice("Which is the same as 1/2?", listOf("2/4", "1/4", "3/4"), "2/4", "🟧⬜  =  🟧🟧⬜⬜", "Count the colored parts on the right."),
            )),
            Lesson("Adding fractions", listOf(
                Learn("When the bottom numbers are the same, add the top numbers. Keep the bottom number. 1/4 + 2/4 = 3/4.", "🟧⬜⬜⬜ + 🟧🟧⬜⬜\n= 🟧🟧🟧⬜"),
                Choice("What is 1/3 + 1/3?", listOf("2/3", "2/6", "1/3"), "2/3", hint = "Keep the bottom number. Add the tops: 1 + 1."),
                Choice("What is 2/5 + 2/5?", listOf("4/10", "4/5", "2/5"), "4/5", hint = "Keep the bottom number. Add the tops: 2 + 2."),
                Choice("What is 3/4 − 1/4?", listOf("2/4", "2/0", "4/4"), "2/4", hint = "Keep the bottom number. Take away the tops: 3 − 1."),
            )),
        ),
    ),
    Course(
        "algebra", "📦", "Algebra", "Find the mystery number",
        listOf(
            Lesson("The mystery box", listOf(
                Learn("In algebra, a box hides a number. Our job is to find it! What number is hiding in the box?", "📦 + 2 = 5"),
                Learn("Think: what plus 2 makes 5? 3 + 2 = 5. So the box is 3!", "3 + 2 = 5 ✅"),
                NumberInput("What is in the box?", 2, "📦 + 4 = 6", "What plus 4 makes 6? Count up from 4 to 6."),
                NumberInput("What is in the box?", 4, "📦 + 5 = 9", "Count up from 5 to 9. How many steps?"),
                NumberInput("What is in the box?", 3, "10 − 📦 = 7", "Count back from 10 to 7. How many steps?"),
                NumberInput("What is in the box?", 4, "📦 × 2 = 8", "Which number doubled makes 8?"),
            )),
            Lesson("Meet x", listOf(
                Learn("Mathematicians use a letter instead of a box. The letter x is a mystery number. x + 3 = 7 means the same as 📦 + 3 = 7.", "📦  →  x"),
                NumberInput("What is x?", 4, "x + 3 = 7", "What plus 3 makes 7?"),
                Learn("An equation is like a balance. Both sides must stay the same. If we take 3 away from one side, we take 3 away from the other side too.", "x + 3 − 3 = 7 − 3\nx = 4"),
                NumberInput("What is x?", 8, "x − 2 = 6", "Add 2 to both sides. 6 + 2 = ?"),
                Learn("2x means 2 times x. If 2x = 10, we split 10 into 2 equal groups. So x = 5.", "2x = 10\nx = 10 ÷ 2 = 5"),
                NumberInput("What is x?", 4, "3x = 12", "Divide both sides by 3. 12 ÷ 3 = ?"),
                Choice("If x = 5, what is x + x?", listOf("5", "10", "55"), "10", hint = "x + x means 5 + 5."),
            )),
            Lesson("Two-step puzzles", listOf(
                Learn("Some puzzles have two steps. Step 1: take away 1 from both sides. Step 2: divide both sides by 2.", "2x + 1 = 7\n2x = 6\nx = 3"),
                NumberInput("First take away 2 from both sides. What is 2x?", 8, "2x + 2 = 10", "10 − 2 = ?"),
                NumberInput("Now, what is x?", 4, "2x = 8", "Divide both sides by 2. 8 ÷ 2 = ?"),
                NumberInput("What is x?", 4, "3x + 1 = 13", "Take away 1: 3x = 12. Then divide by 3."),
                NumberInput("What is x?", 5, "5x − 5 = 20", "Add 5: 5x = 25. Then divide by 5."),
                Choice("Is x = 3 the answer?", listOf("Yes", "No"), "Yes", "4x + 2 = 14", "Put 3 in for x: 4 × 3 + 2 = ?"),
            )),
            Lesson("Plug it in", listOf(
                Learn("If we know x, we can work out a whole expression. If x = 2, then x + 5 = 2 + 5 = 7.", "x = 2\nx + 5 = 7"),
                NumberInput("If x = 3, what is x + 6?", 9, hint = "Swap x for 3. 3 + 6 = ?"),
                NumberInput("If x = 4, what is 2x?", 8, hint = "2x means 2 × 4."),
                NumberInput("If x = 5, what is 3x + 1?", 16, hint = "3 × 5 = 15. Then add 1."),
                Learn("Any letter can be a mystery number: x, y, a or n. They all work the same way.", "x  y  a  n"),
                NumberInput("If y = 6, what is 20 − 2y?", 8, hint = "2 × 6 = 12. Then 20 − 12 = ?"),
            )),
        ),
    ),
    Course(
        "shapes", "🔺", "Shapes", "Sides, perimeter and area",
        listOf(
            Lesson("Shapes and sides", listOf(
                Learn("Shapes have sides and corners. A triangle has 3 sides. A square has 4 sides that are all the same length.", "🔺   🟥"),
                NumberInput("How many sides does a triangle have?", 3, "🔺", "Trace each side with your finger."),
                Choice("Which shape has no corners?", listOf("⬛ square", "⚪ circle", "🔺 triangle"), "⚪ circle", hint = "A corner is a pointy part."),
                NumberInput("A hexagon is the shape of a honeycomb cell. How many sides does it have?", 6, "⬡", "Hexa means six."),
                NumberInput("How many corners does a rectangle have?", 4, "▭", "Count the pointy parts."),
            )),
            Lesson("Perimeter", listOf(
                Learn("Perimeter is the distance all the way around a shape. Add up all the sides. A square with sides of 2 has a perimeter of 2 + 2 + 2 + 2 = 8.", "⬜ 2 + 2 + 2 + 2 = 8"),
                NumberInput("A square has sides of 3. What is the perimeter?", 12, hint = "3 + 3 + 3 + 3"),
                NumberInput("A triangle has sides of 2, 3 and 4. What is the perimeter?", 9, "🔺", "2 + 3 + 4"),
                NumberInput("A rectangle is 5 long and 2 wide. What is the perimeter?", 14, "▭", "5 + 2 + 5 + 2"),
            )),
            Lesson("Area", listOf(
                Learn("Area is how much space is inside a shape. Count the squares inside. This rectangle has 6 squares, so its area is 6.", "🟩🟩🟩\n🟩🟩🟩"),
                NumberInput("What is the area? Count the squares.", 8, "🟩🟩🟩🟩\n🟩🟩🟩🟩", "Count the top row, then keep counting the bottom row."),
                Learn("Quick trick: the area of a rectangle is length × width.", "4 × 2 = 8"),
                NumberInput("A rectangle is 5 long and 3 wide. What is the area?", 15, hint = "5 × 3"),
                NumberInput("A square has sides of 4. What is its area?", 16, hint = "4 × 4"),
            )),
        ),
    ),
    Course(
        "logic", "🧩", "Patterns and Logic", "Find the rule, solve the puzzle",
        listOf(
            Lesson("What comes next?", listOf(
                Learn("A pattern follows a rule. When you find the rule, you can tell what comes next.", "🔴 🔵 🔴 🔵 🔴 🔵"),
                Choice("What comes next?", listOf("🔴", "🔵", "🟢"), "🔵", "🔴 🔵 🔴 🔵 🔴 ❓", "Red, blue, red, blue..."),
                Choice("What comes next?", listOf("⭐", "🌙", "☀️"), "☀️", "⭐ 🌙 ☀️ ⭐ 🌙 ❓", "Star, moon, sun, then it starts again."),
                NumberInput("What comes next?", 10, "2, 4, 6, 8, ❓", "Each number is 2 more."),
                NumberInput("What comes next?", 25, "5, 10, 15, 20, ❓", "Each number is 5 more."),
                NumberInput("What comes next?", 16, "1, 2, 4, 8, ❓", "Each number doubles."),
            )),
            Lesson("Logic puzzles", listOf(
                Learn("Logic means using clues to find the answer. Read each clue slowly. There is no rush.", "🔍"),
                Choice("All cats have whiskers. Tom is a cat. Does Tom have whiskers?", listOf("Yes", "No"), "Yes", "🐱"),
                Choice("Mia is taller than Leo. Leo is taller than Ana. Who is the tallest?", listOf("Mia", "Leo", "Ana"), "Mia", hint = "Mia is taller than Leo, and Leo is taller than Ana."),
                Choice("I am bigger than 3 and smaller than 5. What number am I?", listOf("2", "4", "6"), "4", hint = "Which number sits between 3 and 5?"),
                Choice("Which one does not belong?", listOf("🍎", "🍌", "🚗", "🍇"), "🚗", hint = "Three of them are fruit."),
            )),
        ),
    ),
)
