#!/usr/bin/env python3
"""
VPN Manager for WireGuard configuration rotation.

Manages WireGuard VPN connections for scraping, allowing IP rotation
when bot detection is detected or for distributing load across multiple IPs.

Usage:
    vpn = VPNManager(total_configs=50)

    # Rotate to a random VPN config
    vpn.rotate_vpn()

    # Scraping here...

    # Rotate when blocked
    vpn.rotate_vpn()

    # Disable VPN and use regular IP
    vpn.disable_vpn()
"""
import subprocess
import random
import time
import logging

logging.basicConfig(level=logging.ERROR, format='%(message)s', stream=__import__('sys').stderr)


class VPNManager:
    """Manages WireGuard VPN configuration rotation."""

    def __init__(self, total_configs=50, config_dir="/etc/wireguard", config_prefix="v"):
        """
        Initialize VPN manager.

        Args:
            total_configs: Number of VPN configs available (1 to total_configs)
            config_dir: Directory where WireGuard configs are stored
            config_prefix: Prefix for config files (e.g., "v" for v1.conf, v2.conf)
        """
        self.total_configs = total_configs
        self.config_dir = config_dir
        self.config_prefix = config_prefix
        self.current_interface = None
        self.vpn_enabled = False

    def disable_vpn(self):
        """Shut down any active WireGuard interface we started."""
        if self.current_interface:
            logging.error(f"[VPN] Stopping VPN: {self.current_interface}...")
            result = subprocess.run(
                ["sudo", "wg-quick", "down", self.current_interface],
                capture_output=True,
                text=True
            )
            if result.returncode == 0:
                logging.error(f"[VPN] VPN stopped successfully")
            else:
                logging.error(f"[VPN] Error stopping VPN: {result.stderr}")
            self.current_interface = None
            self.vpn_enabled = False
        else:
            logging.error(f"[VPN] No active VPN to disable")

    def rotate_vpn(self):
        """Pick a random config and switch to it."""
        # Disable the old one first
        self.disable_vpn()

        # Pick a new random config (1 to total_configs)
        new_id = random.randint(1, self.total_configs)
        interface_name = f"{self.config_prefix}{new_id}"
        config_path = f"{self.config_dir}/{interface_name}.conf"

        logging.error(f"[VPN] Rotating to IP from config: {interface_name}.conf")

        # If interface is already up (from previous runs), bring it down first
        try:
            subprocess.run(
                ["sudo", "wg-quick", "down", interface_name],
                capture_output=True,
                text=True,
                timeout=10
            )
        except:
            pass

        # Bring it up
        result = subprocess.run(
            ["sudo", "wg-quick", "up", config_path],
            capture_output=True,
            text=True
        )

        if result.returncode == 0:
            # WireGuard interfaces are named after the filename (without .conf)
            self.current_interface = interface_name
            self.vpn_enabled = True
            # Give the network and DNS more time to settle
            time.sleep(5)
            logging.error(f"[VPN] VPN rotated successfully to interface {interface_name}")
        else:
            logging.error(f"[VPN] Error starting VPN: {result.stderr}")
            self.vpn_enabled = False

    def get_current_ip(self):
        """Get the current public IP address."""
        try:
            result = subprocess.run(
                ["curl", "-s", "https://api.ipify.org"],
                capture_output=True,
                text=True,
                timeout=10
            )
            if result.returncode == 0:
                return result.stdout.strip()
        except Exception as e:
            logging.error(f"[VPN] Error getting current IP: {e}")
        return "Unknown"


def create_vpn_manager(total_configs=50, config_dir="/etc/wireguard", config_prefix=""):
    """
    Factory function to create a VPN manager.

    Args:
        total_configs: Number of VPN configs available
        config_dir: Directory where WireGuard configs are stored
        config_prefix: Prefix for config files (e.g., "v" for v1.conf, v2.conf)

    Returns:
        VPNManager instance or None if VPN is not available
    """
    try:
        # Check if WireGuard is available
        result = subprocess.run(
            ["which", "wg-quick"],
            capture_output=True
        )
        if result.returncode != 0:
            logging.error("[VPN] WireGuard (wg-quick) not found - VPN management disabled")
            return None

        # Check if we have sudo access
        result = subprocess.run(
            ["sudo", "-n", "true"],
            capture_output=True
        )
        if result.returncode != 0:
            logging.error("[VPN] No sudo access - VPN management disabled")
            return None

        return VPNManager(total_configs=total_configs, config_dir=config_dir, config_prefix=config_prefix)
    except Exception as e:
        logging.error(f"[VPN] VPN manager initialization failed: {e}")
        return None


if __name__ == "__main__":
    # Test the VPN manager
    vpn = create_vpn_manager(total_configs=50)

    if vpn:
        print("VPN Manager initialized successfully")
        print(f"Current IP: {vpn.get_current_ip()}")

        # Test rotation
        vpn.rotate_vpn()
        print(f"After rotation, IP: {vpn.get_current_ip()}")

        # Disable
        vpn.disable_vpn()
        print(f"After disable, IP: {vpn.get_current_ip()}")
    else:
        print("VPN Manager not available")
