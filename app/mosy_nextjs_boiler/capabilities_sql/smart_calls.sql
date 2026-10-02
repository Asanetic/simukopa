-- phpMyAdmin SQL Dump
-- version 4.3.11
-- http://www.phpmyadmin.net
--
-- Host: 127.0.0.1
-- Generation Time: Aug 16, 2026 at 12:05 PM
-- Server version: 5.6.24
-- PHP Version: 5.6.8

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8 */;

--
-- Database: `supercrm`
--

-- --------------------------------------------------------

--
-- Table structure for table `smart_calls`
--

CREATE TABLE IF NOT EXISTS `smart_calls` (
  `primkey` int(11) NOT NULL,
  `record_id` varchar(100) NOT NULL,
  `call_number` varchar(100) DEFAULT NULL,
  `related_record_id` varchar(100) DEFAULT NULL,
  `recipient_name` varchar(255) DEFAULT NULL,
  `recipient_phone` varchar(50) DEFAULT NULL,
  `call_channel` enum('whatsapp','phone') DEFAULT 'phone',
  `call_status` enum('initiated','completed','abandoned') DEFAULT 'initiated',
  `call_outcome` enum('answered','no_answer','busy','voicemail','wrong_number') DEFAULT NULL,
  `call_notes` text,
  `duration_seconds` int(11) DEFAULT '0',
  `request_source` varchar(100) DEFAULT NULL,
  `initiated_by` varchar(255) DEFAULT NULL,
  `initiated_on` datetime DEFAULT NULL,
  `completed_on` datetime DEFAULT NULL,
  `created_on` date DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `hive_site_id` varchar(100) DEFAULT NULL,
  `hive_site_name` varchar(255) DEFAULT NULL
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=latin1;

--
-- Dumping data for table `smart_calls`
--

INSERT INTO `smart_calls` (`primkey`, `record_id`, `call_number`, `related_record_id`, `recipient_name`, `recipient_phone`, `call_channel`, `call_status`, `call_outcome`, `call_notes`, `duration_seconds`, `request_source`, `initiated_by`, `initiated_on`, `completed_on`, `created_on`, `created_at`, `updated_at`, `hive_site_id`, `hive_site_name`) VALUES
(1, 'H06ATX5', 'CALL-1786868208855', 'LLOLF14', 'Timothy', '+254710766390', 'whatsapp', 'initiated', '', '', 0, 'clients_smart_call_card', 'superadmin', '2026-08-16 11:16:48', '0000-00-00 00:00:00', '2026-08-16', '2026-08-16 11:16:48', '2026-08-16 11:16:48', 'LLRR0ZKOXRTCOHN_2024-12-28-07-45-56-pm', 'Superadmin'),
(2, 'E436ZPY', 'CALL-1786868589636', 'FG09NQ0', 'Chrispine nyaroche', '+254710766390', 'whatsapp', 'initiated', '', '', 0, 'clients_smart_call_card', 'superadmin', '2026-08-16 11:23:09', '0000-00-00 00:00:00', '2026-08-16', '2026-08-16 11:23:09', '2026-08-16 11:23:09', 'LLRR0ZKOXRTCOHN_2024-12-28-07-45-56-pm', 'Superadmin'),
(3, 'HLDIZZK', 'CALL-1786868694842', 'FG09NQ0', 'Chrispine nyaroche', '+254710766390', 'whatsapp', 'initiated', '', '', 0, 'clients_smart_call_card', 'superadmin', '2026-08-16 11:24:54', '0000-00-00 00:00:00', '2026-08-16', '2026-08-16 11:24:54', '2026-08-16 11:24:54', 'LLRR0ZKOXRTCOHN_2024-12-28-07-45-56-pm', 'Superadmin'),
(4, 'VGTUY7L', 'CALL-1786868952942', 'LLOLF14', 'Timothy', '+254710766390', 'whatsapp', 'completed', '', 'We taled alot', 42, 'clients_smart_call_card', 'superadmin', '2026-08-16 11:29:12', '2026-08-16 11:35:42', '2026-08-16', '2026-08-16 11:29:12', '2026-08-16 12:01:50', 'LLRR0ZKOXRTCOHN_2024-12-28-07-45-56-pm', 'Superadmin'),
(5, '08WO964', 'CALL-1786872188071', 'CRVZPM2', 'Chrispine nyaroche', '+254710766390', 'whatsapp', 'completed', 'answered', 'awesome stuff noted', 35, 'clients_smart_call_card', 'superadmin', '2026-08-16 12:23:08', '2026-08-16 12:23:44', '2026-08-16', '2026-08-16 12:23:08', '2026-08-16 12:23:44', 'LLRR0ZKOXRTCOHN_2024-12-28-07-45-56-pm', 'Superadmin');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `smart_calls`
--
ALTER TABLE `smart_calls`
  ADD PRIMARY KEY (`primkey`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `smart_calls`
--
ALTER TABLE `smart_calls`
  MODIFY `primkey` int(11) NOT NULL AUTO_INCREMENT,AUTO_INCREMENT=6;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
