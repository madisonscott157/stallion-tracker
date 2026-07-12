<?php
/**
 * Plugin Name: Stallion Tracker SSO
 * Description: Adds a single sign-on button that authenticates WordPress users into the Stallion Tracker.
 * Version:     1.0.0
 * Author:      Solis-Litt
 *
 * Usage:
 *   1. Define STALLION_TRACKER_SSO_SECRET in wp-config.php
 *   2. Add the shortcode [stallion_tracker_sso] to any page
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Handle the SSO redirect before any page output.
 *
 * When a logged-in user visits any page with ?stallion_tracker_sso=1,
 * generate a signed URL and redirect to the Stallion Tracker.
 */
add_action( 'template_redirect', function () {
	if ( ! isset( $_GET['stallion_tracker_sso'] ) ) {
		return;
	}

	if ( ! is_user_logged_in() ) {
		auth_redirect();
	}

	$secret = defined( 'STALLION_TRACKER_SSO_SECRET' ) ? STALLION_TRACKER_SSO_SECRET : '';
	if ( empty( $secret ) ) {
		wp_die(
			'Stallion Tracker SSO is not configured. Contact your administrator.',
			'Configuration Error',
			array( 'response' => 500 )
		);
	}

	$user  = wp_get_current_user();
	$email = strtolower( trim( $user->user_email ) );

	if ( empty( $email ) || ! is_email( $email ) ) {
		wp_die(
			'Your WordPress account does not have a valid email address.',
			'SSO Error',
			array( 'response' => 400 )
		);
	}

	$org = 'repole-stable';
	$exp = time() + 60;

	$payload = "{$email}|{$org}|{$exp}";
	$sig     = hash_hmac( 'sha256', $payload, $secret );

	$url = add_query_arg(
		array(
			'email' => $email,
			'org'   => $org,
			'exp'   => $exp,
			'sig'   => $sig,
		),
		'https://stallions.solislitt.com/api/auth/sso'
	);

	wp_redirect( $url );
	exit;
} );

/**
 * Shortcode: [stallion_tracker_sso]
 *
 * Renders an SSO button for logged-in users. Hidden for guests.
 *
 * Attributes:
 *   text  — Button label (default: "Open Stallion Tracker")
 *   class — Additional CSS class (default: none)
 */
add_shortcode( 'stallion_tracker_sso', function ( $atts ) {
	if ( ! is_user_logged_in() ) {
		return '';
	}

	$atts = shortcode_atts(
		array(
			'text'  => 'Open Stallion Tracker',
			'class' => '',
		),
		$atts,
		'stallion_tracker_sso'
	);

	$href  = esc_url( add_query_arg( 'stallion_tracker_sso', '1' ) );
	$class = 'stallion-tracker-sso-btn';
	if ( ! empty( $atts['class'] ) ) {
		$class .= ' ' . sanitize_html_class( $atts['class'] );
	}

	$style = implode( ';', array(
		'display:inline-block',
		'padding:12px 28px',
		'background:#0f172a',
		'color:#fff',
		'text-decoration:none',
		'border-radius:6px',
		'font-weight:600',
		'font-size:15px',
		'transition:opacity 0.2s',
	) );

	return sprintf(
		'<a href="%s" class="%s" style="%s" onmouseover="this.style.opacity=\'0.85\'" onmouseout="this.style.opacity=\'1\'">%s &#8594;</a>',
		$href,
		esc_attr( $class ),
		esc_attr( $style ),
		esc_html( $atts['text'] )
	);
} );
