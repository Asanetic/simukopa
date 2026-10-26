-- phpMyAdmin SQL Dump
-- version 4.3.11
-- http://www.phpmyadmin.net
--
-- Host: 127.0.0.1
-- Generation Time: Aug 24, 2026 at 04:52 AM
-- Server version: 5.6.24
-- PHP Version: 5.6.8

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8 */;

--
-- Database: `imsv1`
--

-- --------------------------------------------------------

--
-- Table structure for table `mosy_metrics`
--

CREATE TABLE IF NOT EXISTS `mosy_metrics` (
  `primkey` int(11) NOT NULL,
  `metric_id` varchar(100) NOT NULL,
  `app_name` varchar(100) NOT NULL,
  `metric_key` varchar(100) NOT NULL,
  `label` varchar(255) NOT NULL,
  `sql_query` text NOT NULL,
  `db_connection_key` varchar(100) NOT NULL,
  `status` varchar(50) DEFAULT 'active',
  `reg_date` datetime DEFAULT CURRENT_TIMESTAMP,
  `hive_site_id` varchar(255) DEFAULT NULL,
  `hive_site_name` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `mosy_reminders`
--

CREATE TABLE IF NOT EXISTS `mosy_reminders` (
  `primkey` int(11) NOT NULL,
  `reminder_id` varchar(100) NOT NULL,
  `tenant_id` varchar(100) NOT NULL,
  `app_name` varchar(100) NOT NULL,
  `time_of_day` time NOT NULL,
  `days_of_week` varchar(50) NOT NULL,
  `recipients_phone` longtext,
  `recipients_email` longtext,
  `subject` varchar(255) DEFAULT NULL,
  `message` text NOT NULL,
  `variable_source` varchar(100) DEFAULT NULL,
  `last_sent_date` date DEFAULT NULL,
  `status` varchar(50) DEFAULT 'active',
  `reg_date` datetime DEFAULT CURRENT_TIMESTAMP,
  `hive_site_id` varchar(255) DEFAULT NULL,
  `hive_site_name` varchar(255) DEFAULT NULL,
  `related_record_id` varchar(255) DEFAULT NULL,
  `repeat_type` varchar(255) DEFAULT NULL
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=latin1;

--
-- Dumping data for table `mosy_reminders`
--

INSERT INTO `mosy_reminders` (`primkey`, `reminder_id`, `tenant_id`, `app_name`, `time_of_day`, `days_of_week`, `recipients_phone`, `recipients_email`, `subject`, `message`, `variable_source`, `last_sent_date`, `status`, `reg_date`, `hive_site_id`, `hive_site_name`, `related_record_id`, `repeat_type`) VALUES
(3, 'O43P7F2', '', 'IMS', '19:02:00', 'Mon,Thu,Sun', '0710766390', 'jereasanya@gmail.com', 'Reminder test', '{first_name} hello dude', '', '2026-08-23', 'Inactive', '0000-00-00 00:00:00', 'LLRR0ZKOXRTCOHN_2024-12-28-07-45-56-pm', 'Superadmin', 'T01L77U', NULL),
(4, 'YIWGMG6', '', 'IMS', '20:04:00', 'Mon,Wed,Sun', '0710766390', 'jereasanya@gmail.com', 'Tropical dessert cafe POS system  meeting', 'Hello hope you are well kind reminder we can set up a meet to review the system @ Sunday 8:30 pm', '', '2026-08-23', 'Active', '0000-00-00 00:00:00', 'LLRR0ZKOXRTCOHN_2024-12-28-07-45-56-pm', 'Superadmin', '6B1H6VC', 'once'),
(5, 'CF79BQ4', '', 'IMS', '23:20:00', 'Sun', '0710766390', 'jereasanya@gmail.com', 'Tropical dessert cafe POS system  meeting', '{amount}', '', NULL, 'Active', '0000-00-00 00:00:00', 'LLRR0ZKOXRTCOHN_2024-12-28-07-45-56-pm', 'Superadmin', '02VOEB1', 'once');

-- --------------------------------------------------------

--
-- Table structure for table `mosy_reminder_log`
--

CREATE TABLE IF NOT EXISTS `mosy_reminder_log` (
  `primkey` int(11) NOT NULL,
  `log_id` varchar(100) NOT NULL,
  `reminder_id` varchar(100) NOT NULL,
  `tenant_id` varchar(100) NOT NULL,
  `channel` varchar(50) NOT NULL,
  `recipient` varchar(255) DEFAULT NULL,
  `rendered_message` text,
  `status` varchar(50) DEFAULT 'sent',
  `error_message` text,
  `reg_date` datetime DEFAULT CURRENT_TIMESTAMP,
  `hive_site_id` varchar(255) DEFAULT NULL,
  `hive_site_name` varchar(255) DEFAULT NULL
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=latin1;

--
-- Dumping data for table `mosy_reminder_log`
--

INSERT INTO `mosy_reminder_log` (`primkey`, `log_id`, `reminder_id`, `tenant_id`, `channel`, `recipient`, `rendered_message`, `status`, `error_message`, `reg_date`, `hive_site_id`, `hive_site_name`) VALUES
(1, '7I522C1', 'O43P7F2', '', 'sms', '0710766390', '{first_name} hello dude', 'sent', '', '2026-08-23 20:05:48', NULL, NULL),
(2, 'OIC79DP', 'O43P7F2', '', 'email', 'jereasanya@gmail.com', '{first_name} hello dude', 'sent', '', '2026-08-23 20:05:52', NULL, NULL),
(3, '6OTGEU1', 'YIWGMG6', '', 'sms', '0710766390', 'Hello hope you are well kind reminder we can set up a meet ot review the system @ Sunday 8:30 pm', 'sent', '', '2026-08-23 20:09:48', NULL, NULL),
(4, 'TKS7C3E', 'YIWGMG6', '', 'email', 'jereasanya@gmail.com', 'Hello hope you are well kind reminder we can set up a meet ot review the system @ Sunday 8:30 pm', 'sent', '', '2026-08-23 20:09:51', NULL, NULL);

--
-- Indexes for dumped tables
--

--
-- Indexes for table `mosy_metrics`
--
ALTER TABLE `mosy_metrics`
  ADD PRIMARY KEY (`primkey`);

--
-- Indexes for table `mosy_reminders`
--
ALTER TABLE `mosy_reminders`
  ADD PRIMARY KEY (`primkey`);

--
-- Indexes for table `mosy_reminder_log`
--
ALTER TABLE `mosy_reminder_log`
  ADD PRIMARY KEY (`primkey`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `mosy_metrics`
--
ALTER TABLE `mosy_metrics`
  MODIFY `primkey` int(11) NOT NULL AUTO_INCREMENT;
--
-- AUTO_INCREMENT for table `mosy_reminders`
--
ALTER TABLE `mosy_reminders`
  MODIFY `primkey` int(11) NOT NULL AUTO_INCREMENT,AUTO_INCREMENT=6;
--
-- AUTO_INCREMENT for table `mosy_reminder_log`
--
ALTER TABLE `mosy_reminder_log`
  MODIFY `primkey` int(11) NOT NULL AUTO_INCREMENT,AUTO_INCREMENT=5;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
