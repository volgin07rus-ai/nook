package com.volgin.nook

import android.graphics.Color
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sin

/**
 * Цвет категории из данных приложения в цвет, который понимает Android.
 *
 * Приложение хранит палитру в oklch — в ней одинаковая на глаз светлота у
 * разных оттенков, и палитра категорий подобрана именно там. Android про oklch
 * не знает, поэтому перевод делается здесь. Второй понимаемый вид — обычный
 * #rrggbb: столько получается, когда цвет выбрали системной пипеткой.
 */
object NookColor {
    private val OKLCH = Regex(
        """oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)""",
        RegexOption.IGNORE_CASE,
    )

    /** null, если строку разобрать не удалось: цвет тогда просто не применяется. */
    fun parse(css: String?): Int? {
        val text = css?.trim() ?: return null
        if (text.isEmpty()) return null

        if (text.startsWith("#")) {
            return try {
                Color.parseColor(text)
            } catch (e: IllegalArgumentException) {
                null
            }
        }

        val m = OKLCH.find(text) ?: return null
        val lightness = m.groupValues[1].toFloatOrNull() ?: return null
        val l = if (m.groupValues[2] == "%") lightness / 100f else lightness
        val c = m.groupValues[3].toFloatOrNull() ?: return null
        val h = m.groupValues[4].toFloatOrNull() ?: return null
        return oklchToRgb(l, c, h)
    }

    /**
     * OKLCH → OKLab → линейный sRGB → sRGB с гаммой. Коэффициенты — из
     * определения OKLab Бьёрна Оттоссона, менять их нельзя.
     */
    private fun oklchToRgb(lightness: Float, chroma: Float, hue: Float): Int {
        val rad = hue * Math.PI.toFloat() / 180f
        val a = chroma * cos(rad)
        val b = chroma * sin(rad)

        val lp = lightness + 0.3963377774f * a + 0.2158037573f * b
        val mp = lightness - 0.1055613458f * a - 0.0638541728f * b
        val sp = lightness - 0.0894841775f * a - 1.2914855480f * b

        val l3 = lp * lp * lp
        val m3 = mp * mp * mp
        val s3 = sp * sp * sp

        val r = 4.0767416621f * l3 - 3.3077115913f * m3 + 0.2309699292f * s3
        val g = -1.2684380046f * l3 + 2.6097574011f * m3 - 0.3413193965f * s3
        val bl = -0.0041960863f * l3 - 0.7034186147f * m3 + 1.7076147010f * s3

        return Color.rgb(channel(r), channel(g), channel(bl))
    }

    private fun channel(linear: Float): Int {
        val v = if (linear <= 0.0031308f) 12.92f * linear
        else 1.055f * linear.toDouble().pow(1.0 / 2.4).toFloat() - 0.055f
        return (v.coerceIn(0f, 1f) * 255f + 0.5f).toInt()
    }
}
